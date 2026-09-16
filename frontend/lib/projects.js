// Penyimpanan NAMA PROJECT per escrow id di localStorage browser.
//
// Keputusan desain (dikonfirmasi): kontrak & backend tidak punya field
// "nama project", jadi disimpan di localStorage — cukup untuk demo 1 browser
// (payer & worker ganti wallet di browser yang sama). Kalau tidak ketemu,
// fallback tampil "Project #<id>".
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
    /* localStorage penuh / private mode — abaikan, hanya label */
  }
}

export function projectName(escrowId) {
  const all = getProjects();
  return all[String(escrowId)] || "";
}