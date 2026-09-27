import UsersIcon from "lucide-solid/icons/users";
import TicketIcon from "lucide-solid/icons/ticket";
import FolderKanbanIcon from "lucide-solid/icons/folder-kanban";
import GitPullRequestIcon from "lucide-solid/icons/git-pull-request";
import DatabaseIcon from "lucide-solid/icons/database";
import BookOpenIcon from "lucide-solid/icons/book-open";
import type { IconComponent } from "../../../icons/icon-component";

/** Explicit imports keep the icon vocabulary tree-shakable; unknown server icons use a safe fallback. */
const icons: Readonly<Record<string, IconComponent>> = {
  users: UsersIcon,
  "book-open": BookOpenIcon,
  ticket: TicketIcon,
  "folder-kanban": FolderKanbanIcon,
  "git-pull-request": GitPullRequestIcon,
};
export function modelIcon(name?: string): IconComponent {
  return name ? (icons[name] ?? DatabaseIcon) : DatabaseIcon;
}
