import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InterviewSession } from "../shared/types";

const sessionsDir = join(process.cwd(), "data", "sessions");

const getFilePath = (sessionId: string) => join(sessionsDir, `${sessionId}.json`);

export const saveSession = async (session: InterviewSession) => {
  await mkdir(sessionsDir, { recursive: true });
  await writeFile(getFilePath(session.id), JSON.stringify(session, null, 2), "utf8");
};

export const loadSession = async (sessionId: string) => {
  try {
    const content = await readFile(getFilePath(sessionId), "utf8");
    return JSON.parse(content) as InterviewSession;
  } catch {
    return null;
  }
};

export const deleteSession = async (sessionId: string) => {
  try {
    await unlink(getFilePath(sessionId));
    return true;
  } catch {
    return false;
  }
};

export const listSessions = async () => {
  if (!existsSync(sessionsDir)) {
    return [] as InterviewSession[];
  }

  const files = await readdir(sessionsDir);
  const sessions = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) => {
        try {
          const content = await readFile(join(sessionsDir, file), "utf8");
          return JSON.parse(content) as InterviewSession;
        } catch {
          return null;
        }
      })
  );

  return sessions
    .filter((session): session is InterviewSession => session !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};
