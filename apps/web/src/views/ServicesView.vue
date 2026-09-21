<script setup lang="ts">
import { Connection, Delete, Edit, Plus } from "@element-plus/icons-vue";
import { useWorkspaceContext } from "../workspace-context";

const { projects, testingConnectionId, connectionResults, shortCommit, openCreateProject, openEditProject, removeProject, testProjectConnection } = useWorkspaceContext();
</script>

<template>
<header class="topbar service-topbar">
          <div class="page-title">
            <h1>服务管理</h1>
            <span>维护 Codeup 仓库与生产分支</span>
          </div>
          <button class="add-project" @click="openCreateProject">
            <el-icon><Plus /></el-icon>
            添加服务
          </button>
        </header>

        <section class="service-summary">
          <div>
            <span>已接入服务</span>
            <strong>{{ projects.length }}</strong>
          </div>
          <p>维护 Codeup 仓库和生产分支。分析入口会直接读取这里的配置。</p>
        </section>

        <section class="service-panel">
          <div class="service-table-head">
            <span>服务</span>
            <span>Codeup 仓库</span>
            <span>生产分支</span>
            <span>最近分析版本</span>
            <span>操作</span>
          </div>

          <div v-if="projects.length" class="service-table-body">
            <div
              v-for="(project, index) in projects"
              :key="project.id"
              class="service-record"
            >
              <div class="service-identity">
                <i>{{ String(index + 1).padStart(2, "0") }}</i>
                <div>
                  <strong>{{ project.name }}</strong
                  ><code>{{ project.code }}</code>
                </div>
              </div>
              <code class="repository-cell" :title="project.repositoryUrl">
                {{ project.repositoryUrl }}
              </code>
              <span class="branch-chip">{{ project.productionBranch }}</span>
              <code class="commit-cell">{{
                shortCommit(project.lastAnalyzedCommit)
              }}</code>
              <div class="record-actions">
                <el-tooltip
                  placement="top"
                  :disabled="!connectionResults[project.id]"
                  :content="connectionResults[project.id]?.message ?? ''"
                >
                  <button
                    class="connection-action"
                    :class="{
                      success: connectionResults[project.id]?.success,
                      failed: connectionResults[project.id]?.success === false,
                    }"
                    :disabled="testingConnectionId === project.id"
                    title="测试仓库与生产分支连接"
                    @click="testProjectConnection(project)"
                  >
                    <el-icon
                      :class="{ spinning: testingConnectionId === project.id }"
                      ><Connection
                    /></el-icon>
                    <span>{{
                      testingConnectionId === project.id ? "测试中" : "测试连接"
                    }}</span>
                  </button>
                </el-tooltip>
                <button title="编辑服务" @click="openEditProject(project)">
                  <el-icon><Edit /></el-icon><span>编辑</span>
                </button>
                <button
                  class="danger"
                  title="删除服务"
                  @click="removeProject(project)"
                >
                  <el-icon><Delete /></el-icon><span>删除</span>
                </button>
              </div>
            </div>
          </div>

          <div v-else class="service-empty">
            <span>EMPTY SERVICE CATALOG</span>
            <h2>还没有接入服务</h2>
            <p>添加 Codeup 仓库后，就可以在发布分析页分析生产版本。</p>
            <button class="primary-action" @click="openCreateProject">
              添加服务
            </button>
          </div>
        </section>
</template>
