<script setup lang="ts">
import { Connection, Delete, Edit, Plus } from "@element-plus/icons-vue";
import { useWorkspaceContext } from "../workspace-context";

const { loading, aiConfigs, aiConfigLoading, testingAiConfigId, aiConnectionResults, pendingNotificationConfig, pendingNotificationLoading, savingPendingNotification, testingPendingNotification, automationConfig, automationConfigLoading, savingAutomationConfig, form, pendingNotificationForm, automationForm, formatLogTime, setAutoInspection, setAutoChangeAnalysis, setAutoAiAnalysis, saveAutomationConfig, savePendingNotificationConfig, testPendingNotification, openCreateAiConfig, openEditAiConfig, toggleAiConfig, makeDefaultAiConfig, testAiConfig, removeAiConfig } = useWorkspaceContext();
</script>

<template>
<section class="base-config-section">
          <header class="base-config-section-header">
            <div>
              <h2>AI 配置</h2>
              <p>
                管理多个 OpenAI 或 Anthropic 兼容接口。每次 AI
                分析仅调用一条“默认且已启用”的配置；API Key
                已加密保存，页面仅显示末四位。
              </p>
            </div>
            <button class="add-project" @click="openCreateAiConfig">
              <el-icon><Plus /></el-icon>
              添加 AI 配置
            </button>
          </header>

          <section class="ai-config-groups" v-loading="aiConfigLoading">
            <div v-if="aiConfigs.length">
              <article
                v-for="config in aiConfigs"
                :key="config.id"
                class="ai-config-group"
              >
                <header class="ai-config-group-title">
                  <div>
                    <strong>{{ config.name }}</strong>
                    <em v-if="config.isDefault">默认</em>
                  </div>
                  <div class="record-actions ai-config-actions">
                    <button
                      class="connection-action"
                      :disabled="testingAiConfigId === config.id"
                      @click="testAiConfig(config)"
                    >
                      <el-icon
                        :class="{ spinning: testingAiConfigId === config.id }"
                        ><Connection
                      /></el-icon>
                      <span>{{
                        testingAiConfigId === config.id ? "测试中" : "测试连接"
                      }}</span>
                    </button>
                    <button
                      v-if="!config.isDefault"
                      @click="makeDefaultAiConfig(config)"
                    >
                      设为默认
                    </button>
                    <button title="编辑配置" @click="openEditAiConfig(config)">
                      <el-icon><Edit /></el-icon><span>编辑</span>
                    </button>
                    <button
                      class="danger"
                      title="删除配置"
                      @click="removeAiConfig(config)"
                    >
                      <el-icon><Delete /></el-icon><span>删除</span>
                    </button>
                  </div>
                </header>

                <div class="ai-config-setting-line">
                  <div class="ai-config-setting-item endpoint">
                    <span class="ai-config-setting-label">接口地址</span>
                    <code :title="config.baseUrl">{{ config.baseUrl }}</code>
                  </div>
                  <div class="ai-config-setting-item">
                    <span class="ai-config-setting-label">模型服务</span>
                    <strong>{{ config.model }}</strong>
                    <span class="ai-config-protocol">{{
                      config.apiFormat === "ANTHROPIC"
                        ? "Anthropic"
                        : "OpenAI"
                    }}</span>
                  </div>
                  <div class="ai-config-setting-item limits">
                    <span class="ai-config-setting-label">分析参数</span>
                    <span class="ai-config-limit"
                      >{{ config.timeoutMs / 1000 }}s</span
                    >
                    <span class="ai-config-limit"
                      >{{ config.maxFiles }} 文件</span
                    >
                    <span class="ai-config-limit"
                      >{{ config.maxSymbols }} Symbol</span
                    >
                  </div>
                  <div class="ai-config-setting-item status">
                    <span class="ai-config-setting-label">运行状态</span>
                    <button
                      class="state-toggle"
                      :class="{ enabled: config.enabled }"
                      @click="toggleAiConfig(config, !config.enabled)"
                    >
                      <i></i>{{ config.enabled ? "已启用" : "已停用" }}
                    </button>
                    <small v-if="aiConnectionResults[config.id]">
                      {{ aiConnectionResults[config.id].latencyMs }}ms
                    </small>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="ai-config-empty">
              <span>NO AI PROVIDER</span>
              <h2>还没有 AI 接口配置</h2>
              <p>添加一个 OpenAI 兼容接口，测试成功后设为默认配置。</p>
              <button class="primary-action" @click="openCreateAiConfig">
                添加 AI 配置
              </button>
            </div>
          </section>

          <section
            class="automation-config-section"
            aria-label="自动化流程配置"
            v-loading="automationConfigLoading"
          >
            <header class="base-config-section-header">
              <div>
                <h2>自动化流程</h2>
                <p>
                  控制定时巡检发现新提交后的执行链。配置只影响自动巡检，手动巡检和手动分析不受影响。
                </p>
              </div>
            </header>

            <form
              class="automation-config-group"
              @submit.prevent="saveAutomationConfig"
            >
              <div class="automation-flow">
                <article
                  class="automation-step selectable"
                  :class="{ enabled: automationForm.autoInspectionEnabled }"
                  role="switch"
                  tabindex="0"
                  :aria-checked="automationForm.autoInspectionEnabled"
                  @click="
                    setAutoInspection(!automationForm.autoInspectionEnabled)
                  "
                  @keydown.enter.prevent="
                    setAutoInspection(!automationForm.autoInspectionEnabled)
                  "
                  @keydown.space.prevent="
                    setAutoInspection(!automationForm.autoInspectionEnabled)
                  "
                >
                  <span class="automation-step-index">1</span>
                  <div>
                    <strong>自动巡检</strong>
                    <small>按系统设定的周期检查生产分支</small>
                  </div>
                  <span
                    class="state-toggle"
                    :class="{ enabled: automationForm.autoInspectionEnabled }"
                  >
                    <i></i>{{
                      automationForm.autoInspectionEnabled
                        ? "已开启"
                        : "未开启"
                    }}
                  </span>
                </article>

                <span class="automation-flow-arrow">→</span>

                <article
                  class="automation-step selectable"
                  :class="{
                    enabled: automationForm.autoChangeAnalysisEnabled,
                  }"
                  role="switch"
                  tabindex="0"
                  :aria-checked="automationForm.autoChangeAnalysisEnabled"
                  @click="
                    setAutoChangeAnalysis(
                      !automationForm.autoChangeAnalysisEnabled,
                    )
                  "
                  @keydown.enter.prevent="
                    setAutoChangeAnalysis(
                      !automationForm.autoChangeAnalysisEnabled,
                    )
                  "
                  @keydown.space.prevent="
                    setAutoChangeAnalysis(
                      !automationForm.autoChangeAnalysisEnabled,
                    )
                  "
                >
                  <span class="automation-step-index">2</span>
                  <div>
                    <strong>自动变更分析</strong>
                    <small>发现新提交后自动创建检测任务</small>
                  </div>
                  <span
                    class="state-toggle"
                    :class="{
                      enabled: automationForm.autoChangeAnalysisEnabled,
                    }"
                  >
                    <i></i>{{
                      automationForm.autoChangeAnalysisEnabled
                        ? "已开启"
                        : "未开启"
                    }}
                  </span>
                </article>

                <span class="automation-flow-arrow">→</span>

                <article
                  class="automation-step selectable"
                  :class="{ enabled: automationForm.autoAiAnalysisEnabled }"
                  role="switch"
                  tabindex="0"
                  :aria-checked="automationForm.autoAiAnalysisEnabled"
                  @click="
                    setAutoAiAnalysis(!automationForm.autoAiAnalysisEnabled)
                  "
                  @keydown.enter.prevent="
                    setAutoAiAnalysis(!automationForm.autoAiAnalysisEnabled)
                  "
                  @keydown.space.prevent="
                    setAutoAiAnalysis(!automationForm.autoAiAnalysisEnabled)
                  "
                >
                  <span class="automation-step-index">3</span>
                  <div>
                    <strong>自动 AI 分析</strong>
                    <small>变更分析成功后调用默认 AI 配置</small>
                  </div>
                  <span
                    class="state-toggle"
                    :class="{ enabled: automationForm.autoAiAnalysisEnabled }"
                  >
                    <i></i>{{
                      automationForm.autoAiAnalysisEnabled
                        ? "已开启"
                        : "未开启"
                    }}
                  </span>
                </article>
              </div>

              <div class="automation-config-footer">
                <span v-if="automationConfig?.updatedAt">
                  上次更新：{{ formatLogTime(automationConfig.updatedAt) }}
                </span>
                <span v-else>尚未保存，当前使用默认关闭状态</span>
                <button
                  class="dialog-primary"
                  type="submit"
                  :disabled="savingAutomationConfig"
                >
                  {{ savingAutomationConfig ? "保存中" : "保存配置" }}
                </button>
              </div>
            </form>
          </section>

          <section
            class="notification-config-section"
            aria-label="待检测通知配置"
            v-loading="pendingNotificationLoading"
          >
            <header class="base-config-section-header">
              <div>
                <h2>待检测通知</h2>
                <p>
                  巡检发现服务存在新的待检测合并时发送钉钉通知；同一服务的同一目标版本只通知一次。
                </p>
              </div>
            </header>

            <form
              class="notification-config-group"
              @submit.prevent="savePendingNotificationConfig"
            >
              <h3>钉钉机器人</h3>
              <div class="notification-config-row">
                <span class="notification-config-label">通知状态</span>
                <button
                  class="notification-option"
                  :class="{ active: !pendingNotificationForm.enabled }"
                  type="button"
                  @click="pendingNotificationForm.enabled = false"
                >
                  <i></i>
                  关闭
                </button>
                <button
                  class="notification-option"
                  :class="{ active: pendingNotificationForm.enabled }"
                  type="button"
                  @click="pendingNotificationForm.enabled = true"
                >
                  <i></i>
                  开启
                </button>
              </div>
              <div class="notification-config-row webhook">
                <label
                  class="notification-config-label"
                  for="ding-talk-webhook"
                  >Webhook</label
                >
                <input
                  id="ding-talk-webhook"
                  v-model="pendingNotificationForm.dingTalkWebhook"
                  type="password"
                  autocomplete="off"
                  :placeholder="
                    pendingNotificationConfig?.webhookMasked ??
                    'https://oapi.dingtalk.com/robot/send?access_token=...'
                  "
                />
                <span class="notification-config-help">
                  {{
                    pendingNotificationConfig?.webhookConfigured
                      ? "已保存 Webhook，留空不会修改"
                      : "请填写钉钉群自定义机器人的 Webhook"
                  }}
                </span>
              </div>
              <div class="notification-config-actions">
                <button
                  class="dialog-secondary"
                  type="button"
                  :disabled="
                    testingPendingNotification ||
                    !pendingNotificationConfig?.webhookConfigured
                  "
                  @click="testPendingNotification"
                >
                  <el-icon
                    :class="{ spinning: testingPendingNotification }"
                    ><Connection
                  /></el-icon>
                  {{ testingPendingNotification ? "发送中" : "发送测试通知" }}
                </button>
                <button
                  class="dialog-primary"
                  type="submit"
                  :disabled="savingPendingNotification"
                >
                  {{ savingPendingNotification ? "保存中" : "保存配置" }}
                </button>
              </div>
            </form>

          </section>
        </section>
</template>
