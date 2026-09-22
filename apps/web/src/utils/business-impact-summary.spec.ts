import { describe, expect, it } from "vitest";
import type { AnalysisTask, RegressionSuggestion } from "@impact-flow/contracts";
import { summarizeBusinessImpacts } from "./business-impact-summary";

const suggestion = (
  overrides: Partial<RegressionSuggestion>,
): RegressionSuggestion => ({
  title: "技术入口",
  scope: "受变更影响",
  priority: "P1",
  ...overrides,
});

describe("summarizeBusinessImpacts", () => {
  it("按固定产品模块组织影响小标题并合并两个分析来源", () => {
    const task = {
      regressionSuggestions: [
        suggestion({ businessDomain: "工地管理", businessScenario: "工地管理创建", priority: "P0" }),
        suggestion({ businessDomain: "工地问题", businessScenario: "工地问题查询" }),
        suggestion({
          businessDomain: "工地签到",
          businessScenario: "工地签到摄像头检测",
          entryPoints: ["POST /project/sign-in/camera/detection"],
        }),
      ],
      aiAnalysis: {
        status: "SUCCESS",
        regressionSuggestions: [
          suggestion({ businessDomain: "工地管理", businessScenario: "工地创建" }),
          suggestion({ businessDomain: "工地监控", businessScenario: "摄像头检测" }),
        ],
      },
    } as Pick<AnalysisTask, "regressionSuggestions" | "aiAnalysis">;

    const result = summarizeBusinessImpacts(task);
    expect(result).toMatchObject({ changeCount: 3, aiCount: 2, pendingCount: 0 });
    expect(result.modules.map((module) => module.name)).toEqual([
      "工地列表",
      "工地签到",
      "工地问题",
      "摄像头",
    ]);
    expect(result.modules[0].items).toEqual([
      expect.objectContaining({ name: "工地创建", changeCount: 1, aiCount: 1, priority: "P0" }),
    ]);
    expect(result.modules[3].items).toEqual([
      expect.objectContaining({ name: "摄像头检测", changeCount: 1, aiCount: 1 }),
    ]);
  });

  it("根据接口路径把宽泛的工地管理语义分配到具体模块", () => {
    const result = summarizeBusinessImpacts({
      regressionSuggestions: [
        suggestion({
          businessDomain: "工地管理",
          businessScenario: "工地管理创建",
          entryPoints: ["POST /project/event-filing/create"],
        }),
        suggestion({
          businessDomain: "交付验收",
          businessScenario: "交付验收查询",
          entryPoints: ["GET /project/acceptance/report/detail"],
        }),
        suggestion({
          businessScenario: "第三方人脸签到触发",
          entryPoints: ["POST /ai/face/check-in"],
        }),
      ],
      aiAnalysis: null,
    });

    expect(result.modules.map((module) => module.name)).toEqual([
      "工地列表",
      "工地签到",
      "验收报告",
      "事件报备",
      "AI相关",
    ]);
    expect(result.modules.find((module) => module.name === "事件报备")?.items[0].name)
      .toBe("事件报备创建");
    expect(result.modules.find((module) => module.name === "AI相关")?.items[0].name)
      .toBe("人脸签到");
  });

  it("使用产品一级页面路由归类，device 签到路由不误归入摄像头", () => {
    const routes = [
      ["#/project/list", "工地列表"],
      ["/device/history/sign", "工地签到"],
      ["#/screen-monitor", "工地巡检"],
      ["/#/report/screen-monitor-report", "工地问题"],
      ["/acceptance-report", "验收报告"],
      ["#/project/event-report", "事件报备"],
      ["/device/camera/bind", "摄像头"],
      ["/ai/face/recognition", "AI相关"],
    ];
    const result = summarizeBusinessImpacts({
      regressionSuggestions: routes.map(([route]) =>
        suggestion({ entryPoints: [route], title: route }),
      ),
      aiAnalysis: null,
    });

    expect(result.modules.map((module) => module.name)).toEqual(routes.map(([, name]) => name));
    expect(result.modules.find((module) => module.name === "工地签到")?.items[0].name)
      .toBe("工地签到查询");
    expect(result.modules.find((module) => module.name === "摄像头")?.items)
      .toHaveLength(1);
  });

  it("AI 未成功时不汇总其中的中间结果", () => {
    const result = summarizeBusinessImpacts({
      regressionSuggestions: [],
      aiAnalysis: {
        status: "RUNNING",
        regressionSuggestions: [suggestion({ businessScenario: "摄像头绑定" })],
      } as AnalysisTask["aiAnalysis"],
    });

    expect(result.modules).toEqual([]);
    expect(result.aiCount).toBe(0);
  });
});
