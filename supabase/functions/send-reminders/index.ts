// Runs on a 5-minute cron (see supabase/cron.sql). For every user with at
// least one push subscription, checks their configured reminder_times
// against "now" in their own local timezone using a 5-minute window match
// (not exact-string equality, since cron granularity is 5 minutes — an
// exact match would miss almost every reminder), sends a Web Push to every
// one of their subscribed devices, and records a reminder_sent_log row so
// the same reminder doesn't fire again later the same day.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const FIELD_LABELS: Record<string, string> = {
  habits: "Daily Goal",
  prayers: "Prayer",
  extra: "Extra Deed",
  health: "Healthy Lifestyle",
};

function localHHMM(timezone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function localDateStr(timezone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function isDueInWindow(reminderTime: string, nowMinutes: number, windowMinutes: number): boolean {
  const windowStart = nowMinutes - (nowMinutes % windowMinutes);
  const t = timeToMinutes(reminderTime);
  return t >= windowStart && t < windowStart + windowMinutes;
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();

  const { data: subs, error: subsErr } = await supabase.from("push_subscriptions").select("*");
  if (subsErr) return new Response(JSON.stringify({ error: subsErr.message }), { status: 500 });
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const userIds = Array.from(new Set(subs.map((s: any) => s.user_id)));
  const { data: reminders, error: remErr } = await supabase
    .from("reminder_times")
    .select("*")
    .in("user_id", userIds);
  if (remErr) return new Response(JSON.stringify({ error: remErr.message }), { status: 500 });

  const subsByUser = new Map<string, any[]>();
  for (const s of subs as any[]) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id)!.push(s);
  }

  let sentCount = 0;
  const deadEndpoints: string[] = [];

  for (const userId of userIds as string[]) {
    const userSubs = subsByUser.get(userId) || [];
    if (userSubs.length === 0) continue;

    // Canonical device for computing "now": most recently updated
    // subscription (documented simplification for the rare
    // multi-device-different-timezone-simultaneously case).
    const canonical = userSubs.reduce((a, b) => (a.updated_at > b.updated_at ? a : b));
    const timezone = canonical.timezone || "UTC";
    const nowMinutes = timeToMinutes(localHHMM(timezone, now));
    const today = localDateStr(timezone, now);

    const userReminders = ((reminders || []) as any[]).filter((r) => r.user_id === userId);
    for (const reminder of userReminders) {
      if (!isDueInWindow(reminder.time, nowMinutes, 5)) continue;

      const { data: already } = await supabase
        .from("reminder_sent_log")
        .select("id")
        .eq("user_id", userId)
        .eq("field", reminder.field)
        .eq("name", reminder.name)
        .eq("sent_date", today)
        .maybeSingle();
      if (already) continue;

      const payload = JSON.stringify({
        title: "Habit Tracker Reminder",
        body: `${FIELD_LABELS[reminder.field] || reminder.field}: ${reminder.name}`,
        field: reminder.field,
        name: reminder.name,
      });

      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sentCount++;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            deadEndpoints.push(sub.endpoint);
          } else {
            console.error("Push send error:", err);
          }
        }
      }

      await supabase.from("reminder_sent_log").upsert(
        { user_id: userId, field: reminder.field, name: reminder.name, sent_date: today },
        { onConflict: "user_id,field,name,sent_date" }
      );
    }
  }

  if (deadEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
  }

  return new Response(JSON.stringify({ sent: sentCount, cleaned: deadEndpoints.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
