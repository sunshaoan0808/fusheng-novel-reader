#!/bin/bash
# 零依赖手动打包 APK: aapt2 + javac + d8 + apksigner (build-tools 34.0.0)
# 用法: VCODE=9 VNAME=1.8 bash build.sh   (默认 9 / 1.8)
set -e
VCODE=${VCODE:-9}
VNAME=${VNAME:-1.8}
APKNAME="novel-reader-v${VCODE}.apk"
APP=~/workspace/apk-work/app
SDK=~/android-sdk
BT=$SDK/build-tools/34.0.0
PJ=$SDK/platforms/android-34/android.jar
OUT=$APP/build
rm -rf $OUT && mkdir -p $OUT/{compiled,res-out,classes,dex}

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
$BT/aapt2 link -o $OUT/base.apk \
  -I $PJ \
  --manifest $APP/AndroidManifest.xml \
  --java $OUT/gen \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code $VCODE --version-name $VNAME \
  $OUT/compiled.zip -A $APP/assets

echo "[3/6] javac"
export PATH=~/jdk17/bin:$PATH
export JAVA_HOME=~/jdk17
mkdir -p $OUT/gen/com/ling/novelreader
find $OUT/gen $APP/src -name "*.java" > $OUT/sources.txt
javac -encoding UTF-8 -source 8 -target 8 -classpath $PJ -d $OUT/classes @$OUT/sources.txt 2>&1 | grep -v "bootstrap\|deprecat" || true
# 守卫: javac 失败会被上面的 || true 吞掉, 这里强制检查产物, 避免打出无 dex 的坏包
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
"$BT/apksigner" verify --print-certs "$APP/$APKNAME" | head -3
ls -la "$APP/$APKNAME"
