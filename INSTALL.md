# NSEOS Preset 安装说明

> 目标:把 `nseos` preset(12 技能 + 门禁)装到本机 DSH,并让门禁自定义包可解析。

## 1. 安装门禁包(一次性)

门禁是自定义 Cordis 包 `@deliveli/nseos-gates`,DSH 从「healed fallback」目录 `~/.dsh/profiles/node_modules/` 解析 preset 引用的包。所以要在那里建一个指向本仓源码的软链:

```bash
mkdir -p ~/.dsh/profiles/node_modules/@deliveli
ln -sfn <repo>/packages/nseos-gates \
  ~/.dsh/profiles/node_modules/@deliveli/nseos-gates
```

> 说明:DSH 启动时 `healProfilesModuleFallback` 会把 CLI 自带包软链进该目录,但不会删掉手动加的软链,所以这条软链会持久保留。DSH 升级后若失效,重跑上面两行即可。

## 2. 安装 preset

```bash
rm -rf ~/.dsh/.agent-presets/nseos
cp -R <repo>/preset ~/.dsh/.agent-presets/nseos
```

## 3. 验证挂载

在 DSH 里用探针插件调用 `standingKeyFor('nseos')`,应返回 OK(无报错即挂载成功)。或在 DSH 的预设选择器里选「NSEOS」开一个会话,确认:
- 12 个 `nseos-*` 技能在 skill 目录可见;
- 业务仓库里未进流程时调非 `nseos-*` 技能会被门禁 deny(带原因);
- release 类 bash(如 `git push`)未进流程会被 deny。

## 4. 更新

本仓是「源 + 分发」一体:
- 内容(技能/引用/模板/preset 组合)更新 = 改 `preset/` → `git commit` → 重跑第 2 步 `cp -R`。
- 门禁代码更新 = 改 `packages/nseos-gates/` → `git commit`(软链指向源码,无需重装)。
- 每次完成打 tag + release(私有库 `DeliveLee/nseos-dsh`)。
