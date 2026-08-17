import {
  CommandPermissionLevel,
  CustomCommandOrigin,
  CustomCommandParamType,
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
  // 次回起動向けにカウント状態を保存するダイナミックプロパティのID
  countState: "keisoku-1gje3_isCount",
  // 常時表示するかを保存するダイナミックプロパティのID
  alwaysShow: "keisoku-4ge23_isAlwaysShow",
  // カウント再開をチャットに送信するかを保存するダイナミックプロパティのID
  notifyAutoResumeOnReload: "keisoku-4ge23_notifyAutoResumeOnReload",
};

// デフォルト設定
system.run(() => {
  if (world.getDynamicProperty(ids.notifyAutoResumeOnReload) === undefined) {
    world.setDynamicProperty(ids.notifyAutoResumeOnReload, true);
  }
});

// その他のグローバル変数さんたち
const isDo = new Map();

// カスタムコマンドの定義
const customCommand = [
  {
    command: {
      name: `${ids.prefix}:start`,
      description: "計測を開始、再開する",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    run: () => {
      doCount();
      worldChat("カウントスタートしました");
    },
  },
  {
    command: {
      name: `${ids.prefix}:stop`,
      description: "計測を停止する",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    run: () => {
      stopCount();
    },
  },
  {
    command: {
      name: `${ids.prefix}:reset`,
      description: "現在の経過時間をリセット",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    run: () => {
      system.run(() => {
        stopCount();
        const countBoard = world.scoreboard.getObjective(ids.scoreboardId);
        countBoard.setScore(ids.scoreName, 0);
        worldChat("カウントリセットしました");
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
     *
     * @param {CustomCommandOrigin} ev
     */
    run: (ev) => {
      system.run(() => {
        const player = ev.sourceEntity;
        countDataForm(player);
      });
    },
  },
  {
    command: {
      name: `${ids.prefix}:setting`,
      description: "アドオンの設定を開く",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    /**
     *
     * @param {CustomCommandOrigin} ev
     */
    run: (ev) => {
      system.run(() => {
        const player = ev.sourceEntity;
        settingForm(player);
      });
    },
  },
  // 常時表示処理※マップシステムとの競合の懸念から非推奨
  // {
  //   command: {
  //     name: `${ids.prefix}:always`,
  //     description:
  //       "現在タイムをアクションバーに常に表示する（引数省略の場合はtrue）",
  //     permissionLevel: CommandPermissionLevel.Admin,
  //     optionalParameters: [
  //       { type: CustomCommandParamType.Boolean, name: "表示の有無" },
  //     ],
  //   },
  //   /**
  //    *
  //    * @param {CustomCommandOrigin} ev
  //    */
  //   run: (ev, arg) => {
  //     if (arg === true || arg === undefined) {
  //       world.setDynamicProperty(alwaysShow, true);
  //       worldChat("常時表示をONにしました");
  //     } else {
  //       world.setDynamicProperty(alwaysShow, false);
  //       worldChat("常時表示をOFFにしました");
  //     }
  //   },
  // },
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
      const intervalNum = system.runInterval(() => {
        const player = world.getAllPlayers();
        if (player.length > 0) {
          world.getDynamicProperty(ids.notifyAutoResumeOnReload)
            ? worldChat("自動でカウントが再開されました")
            : null;

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
    return console.log("すでに実行されています");
  }
  world.setDynamicProperty(ids.countState, true);

  const intervalId = system.runInterval(() => {
    const countBoard = world.scoreboard.getObjective(ids.scoreboardId);
    countBoard.addScore(ids.scoreName, 1);
  }, 20);
  isDo.set("intervalId", intervalId);
}

// 時間のカウントをストップ
function stopCount() {
  if (world.getDynamicProperty(ids.countState)) {
    system.clearRun(isDo.get("intervalId"));
    world.setDynamicProperty(ids.countState, false);
    worldChat("カウントストップしました");
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
  form.label("現在の計測時間");
  form.label(conversionTime(nowCount));
  form.button("更新");

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

// 設定GUI定義
async function settingForm(player) {
  const form = new ModalFormData().title("計測くん");
  form.toggle("再読み込み時にカウントの自動再開をチャットに通知", {
    defaultValue: world.getDynamicProperty(ids.notifyAutoResumeOnReload)
      ? true
      : false,
  });
  form.divider();
  form.submitButton("設定を保存");

  const res = await form.show(player);
  if (res.canceled) return;
  const isNotifyAutoResumeOnReload = res.formValues[0];
  if (isNotifyAutoResumeOnReload) {
    world.setDynamicProperty(ids.notifyAutoResumeOnReload, true);
  } else {
    world.setDynamicProperty(ids.notifyAutoResumeOnReload, false);
  }
}

// 常時表示処理※マップシステムとの競合の懸念から非推奨

// system.runInterval(() => {
//   const isAlways = world.getDynamicProperty(ids.alwaysShow);
//   if (isAlways) {
//     const countBoard = world.scoreboard.getObjective(ids.scoreboardId);
//     const nowCount = countBoard.getScore(ids.scoreName);
//     world
//       .getDimension("overworld")
//       .runCommand(`/title @a actionbar ${conversionTime(nowCount)}`);
//   }
// }, 0);
