import { inject, type InjectionKey } from "vue";
import type { WorkspaceController } from "./composables/useWorkspaceController";

export const WorkspaceContextKey: InjectionKey<WorkspaceController> = Symbol(
  "ImpactFlowWorkspace",
);

export function useWorkspaceContext() {
  const context = inject(WorkspaceContextKey);
  if (!context) {
    throw new Error("Workspace context is not available");
  }
  return context;
}
