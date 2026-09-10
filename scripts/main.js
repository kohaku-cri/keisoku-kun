/*
 * Copyright (c) 2026 kohaku_cri
 * MIT License
 * https://opensource.org/license/mit
 */

import {
  CommandPermissionLevel,
  CustomCommandOrigin,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const ids = {
  // アドオンの名称
  addonName: "ARB",
  // カスタムコマンド接頭辞
  prefix: "keisoku555",
  // 時間記録用スコアボードID
  scoreboardId: "keisoku-iewiojgew4s",
  // 記録用スコア名
  scoreName: "count", // 他システムとの整合性の考慮は不要
  // カウント状態を保存するダイナミックプロパティのID
  countState: "keisoku-1gje3_isCount",
  // カウント再開をチャットに送信するかを保存するダイナミックプロパティのID
  notifyAutoResumeOnReload: "keisoku-4ge23_notifyAutoResumeOnReload",
  // カウントリセット時の確認を厳格にするかを保存するダイナミックプロパティのID
  twoStepConfirmed: "keisoku-h7wti_isTwoStepConfirmed",
};

// 既定の設定
system.run(() => {
  if (world.getDynamicProperty(ids.notifyAutoResumeOnReload) === undefined) {
    world.setDynamicProperty(ids.notifyAutoResumeOnReload, true);
  }
  if (world.getDynamicProperty(ids.twoStepConfirmed) === undefined) {
    world.setDynamicProperty(ids.twoStepConfirmed, true);
  }
});

// その他のグローバル変数さん
const isDo = new Map();

// カスタムコマンドの定義
const customCommand = [
  {
    command: {
      name: `${ids.prefix}:count`,
      description: "操作画面を開く",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    run: (ev) => {
      system.run(() => {
        const player = ev.sourceEntity;
        menuForm(player);
      });
    },
  },
  {
    command: {
      name: `${ids.prefix}:show`,
      description: "現在のタイムを表示",
      permissionLevel: CommandPermissionLevel.Any,
    },
    /**
     * @param {CustomCommandOrigin} ev
     */
    run: (ev) => {
      system.run(() => {
        const player = ev.sourceEntity;
        countDataForm(player);
      });
    },
  },
];

// カスタムコマンドの登録
system.beforeEvents.startup.subscribe((e) => {
  const customCommandRegistry = e.customCommandRegistry;
  for (const command of customCommand) {
    customCommandRegistry.registerCommand(command.command, command.run);
  }
});

// システム初期化
system.beforeEvents.startup.subscribe((e) => {
  system.run(() => {
    // スコアボード作成
    if (!world.scoreboard.getObjective(ids.scoreboardId)) {
      world.scoreboard.addObjective(ids.scoreboardId);
    }
    // 前回プレイ時に計測が実行されている場合は、再開
    if (world.getDynamicProperty(ids.countState)) {
      world.setDynamicProperty(ids.countState, false);
      doCount();

      if (!world.getDynamicProperty(ids.notifyAutoResumeOnReload)) return;
      const intervalNum = system.runInterval(() => {
        const player = world.getAllPlayers();
        if (player.length > 0) {
          worldChat("自動でカウントが再開されました");

          system.clearRun(intervalNum);
        }
      }, 10);
    }
  });
});

// ここまで書いた時点で想像より時間かかってやや後悔してるこはくさんです

// カウント実行
function doCount() {
  // 重複実行対策
  if (world.getDynamicProperty(ids.countState)) {
    return console.error("すでに実行されています");
  }
  world.setDynamicProperty(ids.countState, true);
  const countBoard = world.scoreboard.getObjective(ids.scoreboardId);
  const intervalId = system.runInterval(() => {
    countBoard.addScore(ids.scoreName, 1);
  }, 20);
  isDo.set("intervalId", intervalId);
}

// 時間のカウントをストップ
function stopCount() {
  if (world.getDynamicProperty(ids.countState)) {
    system.clearRun(isDo.get("intervalId"));
    world.setDynamicProperty(ids.countState, false);
  }
}

// 全体チャットにメッセージ表示
function worldChat(text) {
  world.sendMessage(`[${ids.addonName}]${text}`);
}

// タイム表示用GUI定義
async function countDataForm(player) {
  const form = new ActionFormData().title("計測くん");
  const countBoard = world.scoreboard.getObjective(ids.scoreboardId);
  const nowCount = countBoard.getScore(ids.scoreName);
  form.label(
    `計測ステータス：${world.getDynamicProperty(ids.countState) ? "§a実行中" : "§c停止中"}`,
  );
  form.divider()
  form.label("現在の計測時間");
  form.label(conversionTime(nowCount));
  form.button("最新に更新");

  const res = await form.show(player);
  if (res.selection === 0) {
    countDataForm(player);
  }
}

// 時間の変換※s→hms
function conversionTime(rawNumber) {
  const hours = Math.floor(rawNumber / 3600);
  const minutes = Math.floor((rawNumber % 3600) / 60);
  const seconds = rawNumber % 60;
  const result = `${hours}h,${minutes < 10 ? "0" + minutes : minutes}m,${seconds < 10 ? "0" + seconds : seconds}s`;
  return result;
}

// メインメニューGUI定義
async function menuForm(player) {
  const form = new ActionFormData().title("計測くん");
  form.label(
    `計測ステータス：${world.getDynamicProperty(ids.countState) ? "§a実行中" : "§c停止中"}`,
  );
  form.divider();
  form.button("計測スタート・ストップ・再開");
  form.button("現在タイムを確認");
  form.button("設定");
  form.button("時間補正の手引き");
  form.button("計測内容をリセットする");

  const res = await form.show(player);

  if (res.canceled) return;

  switch (res.selection) {
    case 0:
      if (world.getDynamicProperty(ids.countState)) {
        stopCount();
        worldChat("カウントストップしました");
      } else {
        doCount();
        worldChat("カウントスタートしました");
      }
      break;
    case 1:
      countDataForm(player);
      break;
    case 2:
      settingForm(player);
      break;
    case 3:
      correction(player);
      break;
    case 4:
      resetForm(player);
      break;
  }
}

// 設定GUI定義
async function settingForm(player) {
  const form = new ModalFormData().title("計測くん");
  form.toggle("再読み込み時にカウントの自動再開をチャットに通知", {
    defaultValue: world.getDynamicProperty(ids.notifyAutoResumeOnReload),
  });
  form.toggle("カウントリセットの確認を厳格にする", {
    defaultValue: world.getDynamicProperty(ids.twoStepConfirmed),
  });
  form.divider();
  form.submitButton("設定を保存");

  const res = await form.show(player);
  if (res.canceled) return;
  world.setDynamicProperty(ids.notifyAutoResumeOnReload, res.formValues[0]);
  world.setDynamicProperty(ids.twoStepConfirmed, res.formValues[1]);
}

// リセットGUI定義
async function resetForm(player) {
  const form = new ModalFormData().title("計測くん");

  const isTwoStepConfirmed = world.getDynamicProperty(ids.twoStepConfirmed);

  form.divider();
  if (isTwoStepConfirmed) {
    form.textField("リセットするには「reset」と入力してください。", "reset");
  }
  form.submitButton("計測をリセットする");

  const res = await form.show(player);
  if (res.canceled) return;

  if (isTwoStepConfirmed) {
    if (res.formValues[1] !== "reset") {
      player.sendMessage(`失敗しました 入力された値：${res.formValues[1]}`);
      return;
    }
  }

  stopCount();
  const countBoard = world.scoreboard.getObjective(ids.scoreboardId);
  countBoard.setScore(ids.scoreName, 0);
  worldChat("カウントリセットしました");
}

// 時間補正に関する情報
async function correction(player) {
  const form = new ModalFormData().title("計測くん");
  const text = `このアドオンでは計測状況をスコアボードにより"１秒単位"で管理しています。
計測内容を補正したいときはscoreboardコマンドを使用してください。
  
  スコアボードのID：${ids.scoreboardId}
  スコア名：${ids.scoreName}
  `;
  const command = `/scoreboard players add ${ids.scoreName} ${ids.scoreboardId} 600`;

  form.label(text);
  form.textField(
    "例えば現在の計測内容に１０分を加算したいときは次のようにします。",
    "",
    { defaultValue: command },
  );

  form.submitButton("戻る");
  const res = await form.show(player);
  if (res.canceled) return;
  menuForm(player);
}
