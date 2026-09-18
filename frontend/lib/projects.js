// PROJECT NAME storage per escrow id in the browser's localStorage.
//
// Design decision (confirmed): the contract & backend have no "project name"
// field, so it's stored in localStorage — good enough for a single-browser demo
// (payer & worker switching wallets in the same browser). If not found, falls
// back to showing "Project #<id>".
const KEY = "mileai.projects.v1";

const storage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage
    : null;

export function getProjects() {
  try {
    const raw = storage() && storage().getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveProject(escrowId, projectName) {
  if (!projectName) return;
  try {
    const all = getProjects();
    all[String(escrowId)] = projectName;
    storage() && storage().setItem(KEY, JSON.stringify(all));
  } catch {
    /* localStorage full / private mode — ignore, label only */
  }
}

export function projectName(escrowId) {
  const all = getProjects();
  return all[String(escrowId)] || "";
}