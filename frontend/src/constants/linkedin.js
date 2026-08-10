// OAuth CSRF guard. The dashboard stores a random `state` before redirecting to
// LinkedIn; the callback rejects any response whose `state` doesn't match.
// Lives in its own module so the callback chunk doesn't pull in the dashboard.
export const LINKEDIN_OAUTH_STATE_KEY = "linkedin_oauth_state";

export const newLinkedInOAuthState = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};
