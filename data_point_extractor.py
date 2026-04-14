#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据点坐标提取工具 v1.0
从科研论文图片中提取数据点坐标
用法：打开图片 → 标定2个参考点 → 点击目标点获取坐标
"""

import sys
import subprocess
import math

try:
    from PIL import Image, ImageTk, ImageDraw, ImageGrab
except ImportError:
    print("正在安装 Pillow...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "-q"])
    from PIL import Image, ImageTk, ImageDraw, ImageGrab

import tkinter as tk
from tkinter import ttk, filedialog, messagebox


# ──────────────────────────────────────────────────────────────────────────────
# 最小二乘线性拟合：data = a * pixel + b
# ──────────────────────────────────────────────────────────────────────────────
def least_squares_1d(pixels, vals):
    n = len(pixels)
    if n < 2:
        return None, None
    sp  = sum(pixels)
    sv  = sum(vals)
    spv = sum(p * v for p, v in zip(pixels, vals))
    sp2 = sum(p * p for p in pixels)
    det = n * sp2 - sp * sp
    if abs(det) < 1e-12:
        return None, None
    a = (n * spv - sp * sv) / det
    b = (sp2 * sv - sp * spv) / det
    return a, b


# ──────────────────────────────────────────────────────────────────────────────
# 主窗口
# ──────────────────────────────────────────────────────────────────────────────
class PointExtractorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("数据点坐标提取工具 v1.0")
        self.root.geometry("1000x700")

        self.orig_img   = None     # PIL Image（原始分辨率）
        self.photo      = None     # ImageTk（当前缩放后）
        self.zoom       = 1.0
        self.ref_points = []       # [(px, py, dx, dy), ...]  像素→数据
        self.results    = []       # [(px, py, dx, dy), ...]  测量结果

        self.mode   = tk.StringVar(value="calibrate")
        self.axis_x = tk.StringVar(value="linear")
        self.axis_y = tk.StringVar(value="linear")

        self._build_ui()
        self._bind_events()
        self._update_status()

    # ── UI ────────────────────────────────────────────────────────────────────
    def _build_ui(self):
        # 菜单
        menubar = tk.Menu(self.root)
        fm = tk.Menu(menubar, tearoff=0)
        fm.add_command(label="打开图片...  Ctrl+O",   command=self.open_image)
        fm.add_command(label="从剪贴板粘贴  Ctrl+V",  command=self.paste_clipboard)
        fm.add_separator()
        fm.add_command(label="导出结果为 CSV",        command=self.export_csv)
        fm.add_separator()
        fm.add_command(label="退出", command=self.root.quit)
        menubar.add_cascade(label="文件", menu=fm)
        hm = tk.Menu(menubar, tearoff=0)
        hm.add_command(label="使用说明", command=self.show_help)
        menubar.add_cascade(label="帮助", menu=hm)
        self.root.config(menu=menubar)

        # 左侧面板
        sidebar = tk.Frame(self.root, bg="#f0f0f0", padx=8, pady=8, width=215)
        sidebar.pack(side=tk.LEFT, fill=tk.Y)
        sidebar.pack_propagate(False)

        def section(title):
            f = tk.LabelFrame(sidebar, text=title, bg="#f0f0f0",
                              font=("", 9, "bold"), padx=5, pady=5)
            f.pack(fill=tk.X, pady=4)
            return f

        # 打开图片
        img_f = section("图片")
        tk.Button(img_f, text="打开图片...",        command=self.open_image).pack(fill=tk.X, pady=1)
        tk.Button(img_f, text="从剪贴板粘贴 (Ctrl+V)", command=self.paste_clipboard).pack(fill=tk.X, pady=1)

        # 工作模式
        mode_f = section("工作模式")
        tk.Radiobutton(mode_f, text="① 标定参考点", variable=self.mode,
                       value="calibrate", bg="#f0f0f0",
                       command=self._update_status).pack(anchor=tk.W)
        tk.Radiobutton(mode_f, text="② 提取坐标", variable=self.mode,
                       value="measure", bg="#f0f0f0",
                       command=self._update_status).pack(anchor=tk.W)

        # 参考点列表
        ref_f = section("参考点（至少 2 个）")
        self.ref_lb = tk.Listbox(ref_f, height=5, font=("Consolas", 8))
        self.ref_lb.pack(fill=tk.X)
        bf = tk.Frame(ref_f, bg="#f0f0f0"); bf.pack(fill=tk.X, pady=2)
        tk.Button(bf, text="删除选中", command=self.delete_ref,  width=8).pack(side=tk.LEFT, padx=1)
        tk.Button(bf, text="全部清除", command=self.clear_refs,  width=8).pack(side=tk.LEFT, padx=1)

        # 坐标轴类型
        ax_f = section("坐标轴类型")
        xf = tk.Frame(ax_f, bg="#f0f0f0"); xf.pack(fill=tk.X)
        tk.Label(xf, text="X:", bg="#f0f0f0", width=3).pack(side=tk.LEFT)
        tk.Radiobutton(xf, text="线性", variable=self.axis_x, value="linear", bg="#f0f0f0").pack(side=tk.LEFT)
        tk.Radiobutton(xf, text="对数", variable=self.axis_x, value="log",    bg="#f0f0f0").pack(side=tk.LEFT)
        yf = tk.Frame(ax_f, bg="#f0f0f0"); yf.pack(fill=tk.X)
        tk.Label(yf, text="Y:", bg="#f0f0f0", width=3).pack(side=tk.LEFT)
        tk.Radiobutton(yf, text="线性", variable=self.axis_y, value="linear", bg="#f0f0f0").pack(side=tk.LEFT)
        tk.Radiobutton(yf, text="对数", variable=self.axis_y, value="log",    bg="#f0f0f0").pack(side=tk.LEFT)

        # 测量结果
        res_f = section("测量结果")
        self.res_lb = tk.Listbox(res_f, height=8, font=("Consolas", 8))
        self.res_lb.pack(fill=tk.X)
        tk.Button(res_f, text="复制选中",  command=self.copy_selected).pack(fill=tk.X, pady=1)
        tk.Button(res_f, text="复制全部",  command=self.copy_all).pack(fill=tk.X, pady=1)
        tk.Button(res_f, text="撤销最后一个 (Ctrl+Z)", command=self.undo_last).pack(fill=tk.X, pady=1)
        tk.Button(res_f, text="清除全部结果", command=self.clear_results).pack(fill=tk.X, pady=1)

        # 缩放
        zoom_f = section("缩放")
        zf = tk.Frame(zoom_f, bg="#f0f0f0"); zf.pack()
        tk.Button(zf, text="－", command=self.zoom_out,  width=3).pack(side=tk.LEFT)
        self.zoom_lbl = tk.Label(zf, text="100%", bg="#f0f0f0", width=7)
        self.zoom_lbl.pack(side=tk.LEFT)
        tk.Button(zf, text="＋", command=self.zoom_in,   width=3).pack(side=tk.LEFT)
        tk.Button(zoom_f, text="适应窗口", command=self.fit_window).pack(fill=tk.X, pady=2)
        tk.Button(zoom_f, text="重置 100%", command=self.reset_zoom).pack(fill=tk.X, pady=1)

        # 画布区
        right = tk.Frame(self.root)
        right.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.canvas = tk.Canvas(right, bg="#555", cursor="crosshair")
        vsb = ttk.Scrollbar(right, orient=tk.VERTICAL,   command=self.canvas.yview)
        hsb = ttk.Scrollbar(right, orient=tk.HORIZONTAL, command=self.canvas.xview)
        self.canvas.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        vsb.pack(side=tk.RIGHT,  fill=tk.Y)
        hsb.pack(side=tk.BOTTOM, fill=tk.X)
        self.canvas.pack(fill=tk.BOTH, expand=True)

        # 状态栏
        sbar = tk.Frame(self.root, bd=1, relief=tk.SUNKEN, bg="#ddd")
        sbar.pack(side=tk.BOTTOM, fill=tk.X)
        self.status_var = tk.StringVar()
        self.coord_var  = tk.StringVar()
        tk.Label(sbar, textvariable=self.status_var, anchor=tk.W, bg="#ddd").pack(side=tk.LEFT,  fill=tk.X, expand=True)
        tk.Label(sbar, textvariable=self.coord_var,  anchor=tk.E, bg="#ddd").pack(side=tk.RIGHT)

    # ── 事件绑定 ──────────────────────────────────────────────────────────────
    def _bind_events(self):
        self.root.bind("<Control-o>", lambda e: self.open_image())
        self.root.bind("<Control-v>", lambda e: self.paste_clipboard())
        self.root.bind("<Control-z>", lambda e: self.undo_last())
        self.canvas.bind("<Button-1>",    self.on_click)
        self.canvas.bind("<Motion>",      self.on_motion)
        self.canvas.bind("<MouseWheel>",  self.on_scroll)

    # ── 图片加载 ──────────────────────────────────────────────────────────────
    def open_image(self):
        path = filedialog.askopenfilename(
            title="选择图片",
            filetypes=[("图片文件", "*.png *.jpg *.jpeg *.bmp *.tiff *.gif"), ("所有文件", "*.*")]
        )
        if path:
            try:
                self._load_image(Image.open(path).convert("RGB"))
            except Exception as e:
                messagebox.showerror("打开失败", str(e))

    def paste_clipboard(self):
        try:
            img = ImageGrab.grabclipboard()
            if isinstance(img, Image.Image):
                self._load_image(img.convert("RGB"))
            elif img is None:
                messagebox.showinfo("提示", "剪贴板中没有图片\n请先截图或在图片查看器中按 Ctrl+C 复制")
            else:
                messagebox.showinfo("提示", "剪贴板内容不是图片")
        except Exception as e:
            messagebox.showerror("粘贴失败", str(e))

    def _load_image(self, img):
        self.orig_img = img
        self.zoom = 1.0
        self.ref_points.clear()
        self.results.clear()
        self.ref_lb.delete(0, tk.END)
        self.res_lb.delete(0, tk.END)
        self._redraw()
        self._update_status()
        self.root.after(50, self.fit_window)  # 加载后自动适应窗口

    # ── 渲染 ──────────────────────────────────────────────────────────────────
    def _redraw(self):
        if not self.orig_img:
            return
        w = max(1, int(self.orig_img.width  * self.zoom))
        h = max(1, int(self.orig_img.height * self.zoom))

        img  = self.orig_img.resize((w, h), Image.LANCZOS)
        draw = ImageDraw.Draw(img)

        # 参考点标记（红色）
        for i, (px, py, dx, dy) in enumerate(self.ref_points):
            zx, zy = int(px * self.zoom), int(py * self.zoom)
            r = 7
            draw.ellipse([zx-r, zy-r, zx+r, zy+r], outline=(220, 50, 50), width=2)
            draw.line([zx-r-4, zy, zx+r+4, zy], fill=(220, 50, 50), width=1)
            draw.line([zx, zy-r-4, zx, zy+r+4], fill=(220, 50, 50), width=1)
            draw.text((zx+9, zy-10), f"R{i+1}", fill=(220, 50, 50))

        # 测量点标记（蓝色）
        for j, (px, py, dx, dy) in enumerate(self.results):
            zx, zy = int(px * self.zoom), int(py * self.zoom)
            r = 5
            draw.ellipse([zx-r, zy-r, zx+r, zy+r], outline=(30, 110, 230), width=2)
            draw.line([zx-r-3, zy, zx+r+3, zy], fill=(30, 110, 230), width=1)
            draw.line([zx, zy-r-3, zx, zy+r+3], fill=(30, 110, 230), width=1)
            draw.text((zx+7, zy-9), f"P{j+1}", fill=(30, 110, 230))

        self.photo = ImageTk.PhotoImage(img)
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor=tk.NW, image=self.photo)
        self.canvas.configure(scrollregion=(0, 0, w, h))
        self.zoom_lbl.config(text=f"{int(self.zoom * 100)}%")

    # ── 坐标变换 ──────────────────────────────────────────────────────────────
    def _canvas_to_pixel(self, cx, cy):
        """画布事件坐标 → 原始图像像素坐标"""
        return self.canvas.canvasx(cx) / self.zoom, self.canvas.canvasy(cy) / self.zoom

    def _pixel_to_data(self, px, py):
        """像素坐标 → 数据坐标（基于参考点最小二乘拟合）"""
        if len(self.ref_points) < 2:
            return None, None

        pxs = [r[0] for r in self.ref_points]
        pys = [r[1] for r in self.ref_points]
        dxs = [r[2] for r in self.ref_points]
        dys = [r[3] for r in self.ref_points]

        # 对数轴转换
        try:
            if self.axis_x.get() == "log":
                if any(d <= 0 for d in dxs):
                    return None, None
                dxs = [math.log10(d) for d in dxs]
            if self.axis_y.get() == "log":
                if any(d <= 0 for d in dys):
                    return None, None
                dys = [math.log10(d) for d in dys]
        except Exception:
            return None, None

        ax, bx = least_squares_1d(pxs, dxs)
        ay, by = least_squares_1d(pys, dys)

        if ax is None or ay is None:
            return None, None

        data_x = ax * px + bx
        data_y = ay * py + by

        if self.axis_x.get() == "log":
            data_x = 10 ** data_x
        if self.axis_y.get() == "log":
            data_y = 10 ** data_y

        return data_x, data_y

    # ── 鼠标事件 ─────────────────────────────────────────────────────────────
    def on_click(self, event):
        if not self.orig_img:
            return
        px, py = self._canvas_to_pixel(event.x, event.y)
        if self.mode.get() == "calibrate":
            self._add_ref(px, py)
        else:
            self._measure(px, py)

    def on_motion(self, event):
        if not self.orig_img:
            return
        px, py = self._canvas_to_pixel(event.x, event.y)
        if len(self.ref_points) >= 2 and self.mode.get() == "measure":
            dx, dy = self._pixel_to_data(px, py)
            if dx is not None:
                self.coord_var.set(f"  预览: ({dx:.5g},  {dy:.5g})  ")
        else:
            self.coord_var.set(f"  像素: ({px:.0f}, {py:.0f})  ")

    def on_scroll(self, event):
        if event.delta > 0:
            self.zoom_in()
        else:
            self.zoom_out()

    # ── 标定参考点 ───────────────────────────────────────────────────────────
    def _add_ref(self, px, py):
        dlg = RefDialog(self.root, px, py, len(self.ref_points) + 1)
        self.root.wait_window(dlg.top)
        if dlg.result:
            dx, dy = dlg.result
            self.ref_points.append((px, py, dx, dy))
            self.ref_lb.insert(tk.END, f"R{len(self.ref_points)}: ({dx:.4g}, {dy:.4g})")
            self._redraw()
            self._update_status()

    def delete_ref(self):
        sel = self.ref_lb.curselection()
        if not sel:
            return
        idx = sel[0]
        self.ref_points.pop(idx)
        self.ref_lb.delete(0, tk.END)
        for i, (px, py, dx, dy) in enumerate(self.ref_points):
            self.ref_lb.insert(tk.END, f"R{i+1}: ({dx:.4g}, {dy:.4g})")
        self._redraw()
        self._update_status()

    def clear_refs(self):
        self.ref_points.clear()
        self.ref_lb.delete(0, tk.END)
        self._redraw()
        self._update_status()

    # ── 测量 ─────────────────────────────────────────────────────────────────
    def _measure(self, px, py):
        if len(self.ref_points) < 2:
            messagebox.showwarning("未标定", "请先切换到「标定参考点」模式，添加至少 2 个参考点")
            self.mode.set("calibrate")
            self._update_status()
            return
        dx, dy = self._pixel_to_data(px, py)
        if dx is None:
            messagebox.showerror("计算失败", "坐标计算失败，请检查参考点设置（两点不能位于同一列或同一行像素）")
            return
        self.results.append((px, py, dx, dy))
        label = f"({dx:.6g},  {dy:.6g})"
        self.res_lb.insert(tk.END, label)
        self.res_lb.see(tk.END)
        self.coord_var.set(f"  已提取: {label}  ")
        self._redraw()

    def undo_last(self):
        if self.results:
            self.results.pop()
            self.res_lb.delete(tk.END)
            self._redraw()

    def clear_results(self):
        self.results.clear()
        self.res_lb.delete(0, tk.END)
        self._redraw()

    # ── 复制/导出 ────────────────────────────────────────────────────────────
    def copy_selected(self):
        sel = self.res_lb.curselection()
        if sel:
            self.root.clipboard_clear()
            self.root.clipboard_append(self.res_lb.get(sel[0]))

    def copy_all(self):
        items = [self.res_lb.get(i) for i in range(self.res_lb.size())]
        if items:
            self.root.clipboard_clear()
            self.root.clipboard_append("\n".join(items))

    def export_csv(self):
        if not self.results:
            messagebox.showinfo("提示", "没有测量结果可导出")
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV 文件", "*.csv")],
            title="保存 CSV"
        )
        if path:
            with open(path, "w", encoding="utf-8") as f:
                f.write("X,Y\n")
                for _, _, dx, dy in self.results:
                    f.write(f"{dx},{dy}\n")
            messagebox.showinfo("成功", f"已导出到：\n{path}")

    # ── 缩放 ─────────────────────────────────────────────────────────────────
    def zoom_in(self):
        self.zoom = min(self.zoom * 1.25, 12.0)
        self._redraw()

    def zoom_out(self):
        self.zoom = max(self.zoom / 1.25, 0.05)
        self._redraw()

    def reset_zoom(self):
        self.zoom = 1.0
        self._redraw()

    def fit_window(self):
        if not self.orig_img:
            return
        self.root.update_idletasks()
        cw = self.canvas.winfo_width()
        ch = self.canvas.winfo_height()
        iw, ih = self.orig_img.size
        if cw > 10 and ch > 10:
            self.zoom = min(cw / iw, ch / ih, 1.0)
            self._redraw()

    # ── 状态 ─────────────────────────────────────────────────────────────────
    def _update_status(self):
        if not self.orig_img:
            self.status_var.set("  请打开图片或使用 Ctrl+V 从剪贴板粘贴截图")
            return
        n = len(self.ref_points)
        if self.mode.get() == "calibrate":
            if n == 0:
                self.status_var.set("  ① 标定模式：点击图中已知坐标的点，然后输入其数据坐标（需至少 2 个参考点）")
            elif n == 1:
                self.status_var.set("  ① 标定模式：还需再添加 1 个参考点（建议选对角方向的点）")
            else:
                self.status_var.set(f"  ① 标定模式：已有 {n} 个参考点 ✓  可切换到测量模式")
        else:
            if n < 2:
                self.status_var.set("  ⚠ 请先切换到标定模式，添加至少 2 个参考点")
            else:
                self.status_var.set("  ② 测量模式：点击图中目标点以提取坐标（Ctrl+Z 撤销，移动鼠标实时预览）")

    def show_help(self):
        messagebox.showinfo("使用说明", """\
数据点坐标提取工具  使用说明
────────────────────────────
【基本流程】
1. 打开图片（文件 或 Ctrl+V 粘贴截图）
2. 选择「① 标定参考点」模式
   → 点击图中已知坐标的点（如坐标轴刻度）
   → 在弹出窗口中输入该点的 X、Y 数据值
   → 至少需要 2 个参考点（建议选对角线方向）
3. 切换到「② 提取坐标」模式
   → 点击任意目标点，即显示提取的数据坐标
   → 鼠标移动时实时预览坐标

【建议】
• 参考点应选坐标轴上的刻度线交叉点
• 两个参考点尽量相距远，减小误差
• 对数轴：请在坐标轴类型中切换
• 滚轮缩放图片，Ctrl+Z 撤销最后一个点

【快捷键】
Ctrl+O    打开图片
Ctrl+V    粘贴剪贴板图片
Ctrl+Z    撤销最后测量点
""")


# ──────────────────────────────────────────────────────────────────────────────
# 参考点输入对话框
# ──────────────────────────────────────────────────────────────────────────────
class RefDialog:
    def __init__(self, parent, px, py, index):
        self.result = None
        self.top = tk.Toplevel(parent)
        self.top.title(f"输入参考点 R{index} 的坐标")
        self.top.geometry("290x178")
        self.top.resizable(False, False)
        self.top.grab_set()
        self.top.transient(parent)

        # 居中
        self.top.update_idletasks()
        pw = parent.winfo_rootx() + parent.winfo_width()  // 2
        ph = parent.winfo_rooty() + parent.winfo_height() // 2
        self.top.geometry(f"+{pw - 145}+{ph - 89}")

        f = tk.Frame(self.top, padx=18, pady=14)
        f.pack(fill=tk.BOTH, expand=True)

        tk.Label(f, text=f"像素位置：({px:.1f},  {py:.1f})",
                 fg="#666", font=("", 9)).grid(row=0, columnspan=2, sticky=tk.W, pady=(0, 10))

        tk.Label(f, text="该点 X 值：").grid(row=1, column=0, sticky=tk.E, pady=5)
        self.xv = tk.StringVar()
        xe = tk.Entry(f, textvariable=self.xv, width=16)
        xe.grid(row=1, column=1, sticky=tk.W, padx=8, pady=5)
        xe.focus_set()

        tk.Label(f, text="该点 Y 值：").grid(row=2, column=0, sticky=tk.E, pady=5)
        self.yv = tk.StringVar()
        ye = tk.Entry(f, textvariable=self.yv, width=16)
        ye.grid(row=2, column=1, sticky=tk.W, padx=8, pady=5)

        bf = tk.Frame(f); bf.grid(row=3, columnspan=2, pady=8)
        tk.Button(bf, text="确定", command=self._ok,             width=10, default=tk.ACTIVE).pack(side=tk.LEFT, padx=5)
        tk.Button(bf, text="取消", command=self.top.destroy,     width=10).pack(side=tk.LEFT, padx=5)

        self.top.bind("<Return>", lambda e: self._ok())
        self.top.bind("<Escape>", lambda e: self.top.destroy())

    def _ok(self):
        try:
            x = float(self.xv.get().replace(",", ".").strip())
            y = float(self.yv.get().replace(",", ".").strip())
            self.result = (x, y)
            self.top.destroy()
        except ValueError:
            messagebox.showerror("输入错误", "请输入有效的数字", parent=self.top)


# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    root = tk.Tk()
    app = PointExtractorApp(root)
    root.mainloop()
