#!/bin/bash
# 零依赖手动打包 APK: aapt2 + javac + d8 + apksigner (build-tools 34.0.0)
# 用法: VCODE=1000 VNAME=1.41 bash build.sh   (默认 1000 / 1.41)
#       versionCode 方案与 CI 一致: 1000 + 构建序号（CI 用 github.run_number），只增不减
#       CI 里可覆盖路径: APP=<工作目录> SDK=<android sdk> BT=<build-tools 目录> JAVA_HOME=<jdk17>
# 严格模式：任一步失败（含管道中的 javac）立即退出，未定义变量视为错误
set -euo pipefail
VCODE=${VCODE:-1000}
VNAME=${VNAME:-1.41}
# DEBUG=1 打「可调试包」：android:debuggable=1 + WebView 远程调试可用，仅用于真机/模拟器验收。
# 正式包不要带这个开关。
DBG=${DEBUG:-0}
if [ "$DBG" = "1" ]; then
  APKNAME="novel-reader-v${VCODE}-debug.apk"
else
  APKNAME="novel-reader-v${VCODE}.apk"
fi
APP=${APP:-$HOME/workspace/apk-work/app}
SDK=${SDK:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}
BT=${BT:-$SDK/build-tools/34.0.0}
PJ=$SDK/platforms/android-34/android.jar
OUT=$APP/build
rm -rf $OUT && mkdir -p $OUT/{compiled,res-out,classes,dex}
[ -f "$PJ" ] || { echo "FATAL: 找不到 $PJ，请检查 SDK 路径"; exit 1; }
[ -x "$BT/aapt2" ] || { echo "FATAL: 找不到 $BT/aapt2，请检查 build-tools 34.0.0"; exit 1; }

echo "[0/6] 生成内联数据 data.js (JSON 内联进页面, 不走 fetch)"
python3 - "$APP/assets/www" <<'EOF'
import json, os, sys
www = sys.argv[1]
dd = os.path.join(www, "data")
index = json.load(open(os.path.join(dd, "index.json"), encoding="utf-8"))
runs = {}
rp_cards = {}
missing_cards = []
for r in index:
    rid = r["run_id"]
    runs[rid] = json.load(open(os.path.join(dd, f"{rid}.json"), encoding="utf-8"))
    cp = os.path.join(dd, f"rp_cards_{rid}.json")
    if os.path.exists(cp):
        rp_cards[rid] = json.load(open(cp, encoding="utf-8"))
    else:
        # P2-6: 缺失不再静默跳过——打明告警, 避免 index 与 rp_cards 事实源分叉
        missing_cards.append(rid)
if missing_cards:
    print("=" * 60, file=sys.stderr)
    print("WARNING: 以下 run 缺少 rp_cards_*.json, data.js 中其角色卡为空:", file=sys.stderr)
    for rid in missing_cards:
        print(f"  - {rid}", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
with open(os.path.join(www, "data.js"), "w", encoding="utf-8") as f:
    f.write("window.__DATA__=")
    payload = json.dumps({"index": index, "runs": runs, "rp_cards": rp_cards},
                         ensure_ascii=False, separators=(",", ":"))
    # 安全: 小说文本可能包含 "</script>"，直接内联会提前闭合 script 标签并执行注入内容
    f.write(payload.replace("</", "<\\/"))
    f.write(";")
print("data.js ok")
EOF

echo "[1/6] aapt2 compile"
$BT/aapt2 compile --dir $APP/res -o $OUT/compiled.zip

echo "[2/6] aapt2 link"
LINK_EXTRA=""
if [ "$DBG" = "1" ]; then LINK_EXTRA="--debug-mode"; fi
$BT/aapt2 link -o $OUT/base.apk \
  -I $PJ \
  --manifest $APP/AndroidManifest.xml \
  --java $OUT/gen \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code $VCODE --version-name $VNAME \
  $LINK_EXTRA \
  $OUT/compiled.zip -A $APP/assets

echo "[3/6] javac"
if [ -z "${JAVA_HOME:-}" ]; then export JAVA_HOME=$HOME/jdk17; fi
export PATH="$JAVA_HOME/bin:$PATH"
mkdir -p $OUT/gen/com/ling/novelreader
find $OUT/gen $APP/src -name "*.java" > $OUT/sources.txt
# 过滤 bootstrap/deprecation 噪声警告，但不吞 javac 的退出码：
# javac 输出先落盘，成败只看 javac 自己的返回值；grep 过滤后无输出返回 1，不参与判定。
JAVAC_RC=0
javac -encoding UTF-8 -source 8 -target 8 -classpath "$PJ" -d "$OUT/classes" @"$OUT/sources.txt" > "$OUT/javac.log" 2>&1 || JAVAC_RC=$?
grep -v "bootstrap\|deprecat" "$OUT/javac.log" || true
if [ "$JAVAC_RC" -ne 0 ]; then echo "FATAL: javac 编译失败 (exit $JAVAC_RC)"; exit "$JAVAC_RC"; fi
# 双保险: 即使 javac 返回 0 也检查产物, 避免打出无 dex 的坏包
[ -n "$(find $OUT/classes -name '*.class')" ] || { echo "FATAL: javac 未生成任何 class 文件"; exit 1; }

echo "[4/6] d8"
$BT/d8 --min-api 24 --lib $PJ --output $OUT/dex $(find $OUT/classes -name "*.class")

echo "[5/6] apk 打包 assets+dex"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
( cd "$OUT/dex" && zip -q -j -0 ../unsigned.apk classes.dex )
# 对齐：未对齐的 APK 资源无法 mmap，加载更慢且部分渠道会拒收
if [ -x "$BT/zipalign" ]; then
  "$BT/zipalign" -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
  mv "$OUT/aligned.apk" "$OUT/unsigned.apk"
else
  echo "WARN: zipalign 不可用，跳过对齐"
fi

echo "[6/6] 签名"
# 安全: 不再用 debug keystore 签发布包（口令 android 是公开常识，任何人可签同名包覆盖安装）。
# 通过环境变量提供正式签名，keystore 与口令都不进仓库。
KS=${RELEASE_KEYSTORE:-}
if [ -z "$KS" ] || [ ! -f "$KS" ]; then
  echo "FATAL: 缺少发布签名。请设置 RELEASE_KEYSTORE（keystore 路径）与 RELEASE_KEY_ALIAS，"
  echo "       口令通过 RELEASE_STOREPASS / RELEASE_KEYPASS 环境变量提供。"
  exit 1
fi
"$BT/apksigner" sign --ks "$KS" --ks-key-alias "${RELEASE_KEY_ALIAS:-release}" \
  --ks-pass "env:RELEASE_STOREPASS" --key-pass "env:RELEASE_KEYPASS" \
  --out "$APP/$APKNAME" "$OUT/unsigned.apk"
# 先落盘再截取, 避免 pipefail 下 head 提前关管道导致 SIGPIPE 误判失败
"$BT/apksigner" verify --print-certs "$APP/$APKNAME" > "$OUT/verify.txt"
head -3 "$OUT/verify.txt"
ls -la "$APP/$APKNAME"
