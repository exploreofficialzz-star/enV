import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getSql } from "../db";

const SUBUNITS_PER_TOKEN = 1_000;

function videoReferralSignature(code: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw Object.assign(new Error("Referral link signing is not configured for this deployment."), {
      code: "REFERRAL_SIGNING_NOT_CONFIGURED", status: 503,
    });
  }
  return createHmac("sha256", secret).update(`env-referral:video:${code}`).digest("hex");
}

function verifyVideoReferralSignature(code: string, supplied: unknown): boolean {
  if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = videoReferralSignature(code);
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}

function newReferralCode(): string {
  return `ENV${randomBytes(6).toString("hex").toUpperCase()}`;
}

async function ensureReferralProfile(userId: string) {
  const sql = await getSql();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await sql.query<{ referral_code: string }>(
      "select referral_code from billing_referral_profiles where user_id = $1",
      [userId],
    );
    if (existing[0]) return existing[0].referral_code;
    await sql.query(
      "insert into billing_referral_profiles (user_id, referral_code) values ($1, $2) on conflict do nothing",
      [userId, newReferralCode()],
    );
  }
  const final = await sql.query<{ referral_code: string }>(
    "select referral_code from billing_referral_profiles where user_id = $1",
    [userId],
  );
  if (!final[0]) throw new Error("A referral profile could not be created.");
  return final[0].referral_code;
}

export async function getRewardsSummary(userId: string) {
  const sql = await getSql();
  const referralCode = await ensureReferralProfile(userId);
  const referralRows = await sql.query<{
    referral_count: number | string;
    pending_referrals: number | string;
    qualified_referrals: number | string;
    video_signups: number | string;
    video_conversions: number | string;
  }>(
    `select count(*) as referral_count,
            count(*) filter (where status = 'pending') as pending_referrals,
            count(*) filter (where status = 'rewarded') as qualified_referrals,
            count(*) filter (where source = 'video') as video_signups,
            count(*) filter (where source = 'video' and status = 'rewarded') as video_conversions
       from billing_referrals where referrer_user_id = $1`,
    [userId],
  );
  const rewardRows = await sql.query<{
    reward_type: string;
    amount_subunits: number | string;
    status: string;
  }>(
    `select reward_type, coalesce(sum(amount_subunits), 0) as amount_subunits, status
       from billing_reward_events where user_id = $1
       group by reward_type, status`,
    [userId],
  );
  const counts = referralRows[0] ?? {
    referral_count: 0, pending_referrals: 0, qualified_referrals: 0, video_signups: 0, video_conversions: 0,
  };
  const values = { referralTokens: 0, affiliateTokens: 0, bonusTokens: 0, pendingRewardTokens: 0, totalRewardTokens: 0 };
  for (const reward of rewardRows) {
    const subunits = Number(reward.amount_subunits);
    if (!Number.isSafeInteger(subunits) || subunits < 0) continue;
    const tokens = subunits / SUBUNITS_PER_TOKEN;
    if (reward.status === "pending") values.pendingRewardTokens += tokens;
    if (reward.status !== "credited") continue;
    values.totalRewardTokens += tokens;
    if (reward.reward_type === "affiliate_conversion") values.affiliateTokens += tokens;
    else if (reward.reward_type === "bonus") values.bonusTokens += tokens;
    else values.referralTokens += tokens;
  }
  return {
    referralCode,
    videoSignature: videoReferralSignature(referralCode),
    referralCount: Number(counts.referral_count),
    pendingReferrals: Number(counts.pending_referrals),
    qualifiedReferrals: Number(counts.qualified_referrals),
    videoSignups: Number(counts.video_signups),
    videoConversions: Number(counts.video_conversions),
    ...values,
  };
}

export async function claimReferral(input: {
  referredUserId: string;
  referralCode: string;
  source: "referral" | "video";
  signature?: unknown;
}) {
  const code = input.referralCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{8,24}$/.test(code)) {
    throw Object.assign(new Error("That referral link is not valid."), { code: "INVALID_REFERRAL", status: 400 });
  }
  // The video marker is server-signed. Arbitrary source=video query parameters
  // cannot mint the additional affiliate-conversion reward.
  if (input.source === "video" && !verifyVideoReferralSignature(code, input.signature)) {
    throw Object.assign(new Error("This video affiliate link is invalid or has been changed. Use the exact link provided by enV."), {
      code: "INVALID_VIDEO_REFERRAL_SIGNATURE", status: 400,
    });
  }
  const sql = await getSql();
  const profiles = await sql.query<{ user_id: string }>(
    "select user_id from billing_referral_profiles where referral_code = $1",
    [code],
  );
  const referrer = profiles[0];
  if (!referrer) throw Object.assign(new Error("That referral link could not be found."), { code: "REFERRAL_NOT_FOUND", status: 404 });
  if (referrer.user_id === input.referredUserId) {
    throw Object.assign(new Error("You cannot use your own referral link."), { code: "SELF_REFERRAL", status: 400 });
  }
  const id = randomUUID();
  const inserted = await sql.query<{ id: string }>(
    `insert into billing_referrals
       (id, referrer_user_id, referred_user_id, referral_code, source, status)
     values ($1, $2, $3, $4, $5, 'pending')
     on conflict (referred_user_id) do nothing
     returning id`,
    [id, referrer.user_id, input.referredUserId, code, input.source],
  );
  if (inserted[0]) return { claimed: true, alreadyClaimed: false };
  const existing = await sql.query<{ referrer_user_id: string; referral_code: string }>(
    "select referrer_user_id, referral_code from billing_referrals where referred_user_id = $1",
    [input.referredUserId],
  );
  if (existing[0]?.referrer_user_id === referrer.user_id && existing[0]?.referral_code === code) {
    return { claimed: true, alreadyClaimed: true };
  }
  throw Object.assign(new Error("A referral has already been attached to this account and cannot be changed."), { code: "REFERRAL_ALREADY_CLAIMED", status: 409 });
}
