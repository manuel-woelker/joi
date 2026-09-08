import { defineCommand, defineStruct, stringType } from "../engine/model/declarations.ts";

export const UserInfo = defineStruct({
  name: "UserInfo",
  description: "The currently authenticated user.",
  fields: [
    { name: "id", type: stringType, description: "The stable user identifier." },
    { name: "username", type: stringType, description: "The user's login name." },
    { name: "name", type: stringType, description: "The user's display name." },
  ],
});

export default defineCommand({
  id: "user-info",
  description: "Return the user associated with the current session cookie.",
  request: defineStruct({
    name: "UserInfoRequest",
    description: "An empty request because authentication is supplied by the session cookie.",
    fields: [],
  }),
  response: UserInfo,
});
