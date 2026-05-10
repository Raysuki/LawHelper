import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.resolve(__dirname, "../data");
export const libraryFile = path.join(dataDir, "library.json");

const defaultLibrary = {
  projects: [
    { id: "g1", name: "民法作业", cases: [], expanded: true },
    { id: "g2", name: "行政案例调查", cases: [], expanded: false }
  ],
  cases: []
};

export function ensureLibrary() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(libraryFile)) {
    fs.writeFileSync(libraryFile, JSON.stringify(defaultLibrary, null, 2), "utf8");
  }
}

export function readLibrary() {
  ensureLibrary();
  try {
    const parsed = JSON.parse(fs.readFileSync(libraryFile, "utf8"));
    return {
      projects: Array.isArray(parsed.projects) && parsed.projects.length > 0 ? parsed.projects : defaultLibrary.projects,
      cases: Array.isArray(parsed.cases) ? parsed.cases : []
    };
  } catch {
    return defaultLibrary;
  }
}

export function writeLibrary(library) {
  ensureLibrary();
  fs.writeFileSync(libraryFile, JSON.stringify(library, null, 2), "utf8");
}

export function addCasesToProject(projectId, cases) {
  const library = readLibrary();
  const targetProjectId = projectId || library.projects[0]?.id || "g1";
  if (!library.projects.some((project) => project.id === targetProjectId)) {
    library.projects.push({ id: targetProjectId, name: "默认案例库", cases: [], expanded: true });
  }
  const project = library.projects.find((item) => item.id === targetProjectId);
  library.cases = [...cases, ...library.cases];
  project.cases = [...cases.map((item) => item.id), ...project.cases.filter((id) => !cases.some((item) => item.id === id))];
  project.expanded = true;
  writeLibrary(library);
  return library;
}

export function deleteCase(caseId) {
  const library = readLibrary();
  library.cases = library.cases.filter((item) => item.id !== caseId);
  library.projects = library.projects.map((project) => ({
    ...project,
    cases: project.cases.filter((id) => id !== caseId)
  }));
  writeLibrary(library);
  return library;
}

export function renameCase(caseId, name) {
  const library = readLibrary();
  library.cases = library.cases.map((item) => {
    if (item.id !== caseId) return item;
    return {
      ...item,
      name,
      analysisMeta: item.analysisMeta ? { ...item.analysisMeta, 案件名称: name } : item.analysisMeta,
      updatedAt: new Date().toISOString()
    };
  });
  writeLibrary(library);
  return library;
}
