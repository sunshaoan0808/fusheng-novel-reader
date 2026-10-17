package com.ling.novelreader;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/* 极简分享 Provider: 只读 serving getCacheDir()/shared 下的文件,
 * 供 ACTION_SEND 分享 PNG 角色卡。不引入 androidx FileProvider, 零依赖。 */
public class SharedFileProvider extends ContentProvider {
    @Override
    public boolean onCreate() { return true; }

    private File sharedDir() {
        return new File(getContext().getCacheDir(), "shared");
    }

    @Override
    public String getType(Uri uri) {
        /* v37: 只有文件真实存在且是 PNG 才声明 image/png，避免误导消费方 */
        File f = fileFor(uri);
        if (f == null || !f.exists()) return null;
        return f.getName().toLowerCase().endsWith(".png")
                ? "image/png" : "application/octet-stream";
    }

    private File fileFor(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null || !name.matches("[A-Za-z0-9._-]+")) return null;
        /* v37: 白名单正则允许 ".."，显式拒绝目录别名 */
        if (name.equals(".") || name.equals("..")) return null;
        try {
            File dir = sharedDir();
            File f = new File(dir, name);
            /* 规范化后校验前缀，兜底任何形式的路径穿越 */
            String base = dir.getCanonicalPath() + File.separator;
            if (!f.getCanonicalPath().startsWith(base)) return null;
            return f;
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        File f = fileFor(uri);
        MatrixCursor c = new MatrixCursor(
                new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        if (f != null && f.exists()) c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        if (f == null || !f.exists()) throw new FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException();
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException();
    }
}
