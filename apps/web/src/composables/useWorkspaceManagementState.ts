import { computed, reactive, ref, type Ref } from "vue";
import type {
  AuthSession,
  CreateWorkspaceInput,
  WorkspaceCreationPolicy,
  WorkspaceOverview,
} from "@impact-flow/contracts";

export type WorkspaceSettingsTab = "profile" | "audit" | "danger";

/** 工作空间列表、创建与设置页共享的领域状态。 */
export function useWorkspaceManagementState(
  currentSession: Ref<AuthSession | null>,
) {
  const workspaces = ref<WorkspaceOverview[]>([]);
  const workspacesLoading = ref(false);
  const workspaceCreationPolicy = ref<WorkspaceCreationPolicy>({
    mode: "ANY_USER",
    allowed: true,
  });
  const switchingWorkspaceId = ref<string | null>(null);
  const workspaceDialogVisible = ref(false);
  const savingWorkspace = ref(false);
  const workspaceSettingsTab = ref<WorkspaceSettingsTab>("profile");
  const savingWorkspaceSettings = ref(false);
  const archivingWorkspace = ref(false);
  const restoringWorkspace = ref(false);
  const archiveConfirmName = ref("");

  const workspaceForm = reactive<CreateWorkspaceInput>({
    name: "",
    code: "",
    description: "",
  });
  const workspaceSettingsForm = reactive({ name: "", description: "" });

  const isCurrentWorkspaceArchived = computed(
    () => currentSession.value?.workspace.status === "ARCHIVED",
  );
  const currentWorkspace = computed(
    () =>
      workspaces.value.find(
        (item) => item.id === currentSession.value?.workspace.id,
      ) ?? null,
  );
  const canManageWorkspace = computed(() => {
    const role = currentSession.value?.workspace.role;
    return role === "OWNER" || role === "ADMIN";
  });

  return {
    workspaces,
    workspacesLoading,
    workspaceCreationPolicy,
    switchingWorkspaceId,
    workspaceDialogVisible,
    savingWorkspace,
    workspaceSettingsTab,
    savingWorkspaceSettings,
    archivingWorkspace,
    restoringWorkspace,
    archiveConfirmName,
    workspaceForm,
    workspaceSettingsForm,
    isCurrentWorkspaceArchived,
    currentWorkspace,
    canManageWorkspace,
  };
}
