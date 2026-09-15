import { CommandService } from "../../../generated/api/command-service";
import type { UserInfo } from "../../../generated/api/api";
import { executeDataQuery } from "../query/query-client";
import type { FetchService } from "../../../base/services/fetch-service";

export type AuthenticatedUser = UserInfo;

export async function loadCurrentUser(service: FetchService): Promise<AuthenticatedUser> {
  return parseUser(await new CommandService(service).userInfo({}));
}

export async function loadLoginUsers(service: FetchService): Promise<readonly AuthenticatedUser[]> {
  const result = await executeDataQuery(service, {
    tableName: "users",
    criterion: "match_any",
    sorting: [],
    maxResults: 100,
    attributes: ["id", "username", "name"],
  });
  const id = result.requireColumn("id");
  const username = result.requireColumn("username");
  const name = result.requireColumn("name");
  return result.rows.map((row) => ({
    id: String(row.value(id)),
    username: String(row.value(username)),
    name: String(row.value(name)),
  }));
}

export async function login(service: FetchService, userId: string): Promise<AuthenticatedUser> {
  const response = await service.post("/api/login", { user_id: userId });
  if (!response || typeof response !== "object" || !("user" in response)) {
    throw new Error("Login returned an invalid response");
  }
  return parseUser(response.user);
}

export async function logout(service: FetchService): Promise<void> {
  await service.post("/api/logout", {});
}

function parseUser(value: unknown): AuthenticatedUser {
  if (!value || typeof value !== "object") throw new Error("User info returned an invalid response");
  const user = value as Partial<AuthenticatedUser>;
  if (typeof user.id !== "string" || typeof user.username !== "string" || typeof user.name !== "string") {
    throw new Error("User info returned invalid user fields");
  }
  return { id: user.id, username: user.username, name: user.name };
}
