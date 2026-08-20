import z from "schemastery";
import { basename, join } from "node:path";
import { promises } from "node:fs";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
//#region src/host/openspec/change-session-bindings.ts
/**
* 提案 → 会话绑定（标记文件方案）。
*
* 绑定权威存储 = 提案目录内的 .dsh-session 隐藏文件（内容为会话
* id）。随提案目录走（归档移动也带着），不依赖宿主设置持久化。
*
* 写入时机：点“创建提案”→ 新会话就绪后记录待绑定 (项目路径 →
* {会话 id, 点击时刻})。此后任何一次 overview 扫描 / 定位查询，
* 都会做惰性对账：该项目下 birthtime 晚于点击时刻、且尚无标记
* 文件的提案目录 = 那次创建的产物，直接写入标记文件。
* （/openspec-new-change 命令只是预填草稿，提案目录要等 agent
* 执行后才出现，所以绑定必然是延迟完成的。）
*
* 定位优先级：标记文件 → 第一条会话兜底。标记指向的会话不在
* 项目会话列表里时视为失效，忽略标记。
*/
/** 提案目录内绑定标记文件的文件名。 */
const MARKER_FILENAME = ".dsh-session";
/** 管理待绑定记录与标记文件的读写对账。 */
var ChangeSessionBindings = class {
	pending = /* @__PURE__ */ new Map();
	/** 读取提案目录的绑定标记；不存在/不可读返回 undefined。 */
	async readMarker(changeDir) {
		try {
			const trimmed = (await promises.readFile(join(changeDir, MARKER_FILENAME), "utf8")).trim();
			return trimmed === "" ? void 0 : trimmed;
		} catch {
			return;
		}
	}
	/** 把绑定标记写入提案目录（原子写，失败静默——下次对账重试）。 */
	async writeMarker(changeDir, sessionId) {
		try {
			await promises.writeFile(join(changeDir, MARKER_FILENAME), `${sessionId}\n`, "utf8");
		} catch {}
	}
	/** 记录一次“点击创建提案 → 新建会话”的待绑定。 */
	bindLater(projectPath, sessionId) {
		this.pending.set(projectPath, {
			sessionId,
			since: Date.now()
		});
	}
	/**
	* 惰性对账：为 pending 里每个项目，把“点击时刻之后新建且尚无
	* 标记”的提案目录绑给点击时创建的会话。birthtime（目录创建
	* 时间）晚于点击时刻 = 那次创建的产物，毫秒级精确，不受提案名
	* 启发式影响。只绑定一个（最新的那个）——一次点击只创建一个
	* 提案；绑到了才清待绑定，目录还没出现就保留到下次。
	*/
	async reconcile(projects) {
		for (const [projectPath, pending] of this.pending) {
			const project = projects.find((p) => p.path === projectPath);
			if (project === void 0) continue;
			const candidates = [];
			for (const change of project.changes) {
				if (change.status === "archived") continue;
				try {
					const stat = await promises.stat(join(projectPath, "openspec", "changes", change.name));
					if (!stat.isDirectory()) continue;
					if (stat.birthtimeMs > pending.since) candidates.push({
						name: change.name,
						bornAt: stat.birthtimeMs
					});
				} catch {}
			}
			if (candidates.length === 0) continue;
			candidates.sort((a, b) => b.bornAt - a.bornAt);
			const target = candidates[0];
			await this.writeMarker(join(projectPath, "openspec", "changes", target.name), pending.sessionId);
			this.pending.delete(projectPath);
		}
	}
};
//#endregion
//#region src/host/prefs.ts
/**
* 设置命名空间与偏好读写：持久化已导入项目列表与最近扫描目录。
*/
const PREFS_NS = settingsNamespace("dsh-openspec-suite");
const PrefsSchema = z.object({
	/** 已导入的项目根目录（绝对路径），按导入顺序。 */
	projects: z.array(z.string()).default([]),
	/** 最近一次扫描的根目录，用于在导入视图中预填。 */
	lastScanRoot: z.string().default("")
});
/** 在 settings 服务就绪的子作用域里创建偏好读取句柄。 */
function createPrefsScope(settings) {
	return settings.register(PREFS_NS, PrefsSchema);
}
/** 写入偏好 patch（register 返回的 scope 只能读，写走 settings.update）。 */
async function updatePrefs(settings, patch) {
	await settings.update(PREFS_NS, patch);
}
const SKIP_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".venv",
	"venv",
	"__pycache__",
	"target",
	"openspec"
]);
/** 判断 `dir` 是否含有带 `changes/` 子目录的 `openspec/` 目录。 */
async function isOpenspecProject(dir) {
	try {
		return (await promises.stat(join(dir, "openspec", "changes"))).isDirectory();
	} catch {
		return false;
	}
}
/**
* 枚举 `rootDir` 下最多 `maxDepth` 层的候选目录。
* 使用递归 readdir（只返回名字）再对每个候选用 stat() 复核，
* 因此从不信任 Dirent 的类型字段（在 Electron 宿主里
* `entry.isDirectory()` 已被证明不可靠）。
*/
async function listSubdirectories(rootDir, maxDepth, signal) {
	const results = [];
	const queue = [{
		dir: rootDir,
		depth: 0
	}];
	while (queue.length > 0) {
		if (signal?.aborted) break;
		const { dir, depth } = queue.shift();
		if (depth >= maxDepth) continue;
		let names;
		try {
			names = await promises.readdir(dir);
		} catch {
			continue;
		}
		for (const name of names) {
			if (signal?.aborted) break;
			if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
			const child = join(dir, name);
			let stat;
			try {
				stat = await promises.stat(child);
			} catch {
				continue;
			}
			if (!stat.isDirectory()) continue;
			results.push(child);
			queue.push({
				dir: child,
				depth: depth + 1
			});
		}
	}
	return results;
}
/**
* 扫描 `rootDir`（含其自身）最多 `maxDepth` 层，找出所有包含
* `openspec/changes/` 的目录。
*/
async function scanOpenspecProjects(rootDir, signal, maxDepth = 4) {
	const found = [];
	const rootName = basename(rootDir) || rootDir;
	if (await isOpenspecProject(rootDir)) found.push({
		path: rootDir,
		name: rootName,
		root: true
	});
	for (const child of await listSubdirectories(rootDir, maxDepth, signal)) if (await isOpenspecProject(child)) found.push({
		path: child,
		name: basename(child),
		root: child === rootDir
	});
	return found;
}
//#endregion
//#region src/host/openspec/changes.ts
/**
* 提案进度：读取 openspec 项目的 changes/ 目录，按自定义 schema
* 汇总每个提案的生命周期状态、产物清单与任务勾选进度。
*/
/** 读取文件 stat 摘要；文件不可读时返回 undefined。 */
async function statFile(file) {
	try {
		const stat = await promises.stat(file);
		if (!stat.isFile()) return void 0;
		return {
			bytes: stat.size,
			mtime: stat.mtime.toISOString()
		};
	} catch {
		return;
	}
}
/** 解析 tasks.md 的复选框进度。 */
function parseTasks(content) {
	let done = 0;
	let total = 0;
	for (const match of content.matchAll(/^\s*[-*]\s+\[( |x|X)\]/gm)) {
		total += 1;
		if (match[1] !== " ") done += 1;
	}
	return {
		done,
		total
	};
}
/**
* 读取项目自定义 schema（openspec/schemas 下任意子目录的 schema.yaml，
* 取第一个存在的），抽取 artifacts 列表（id + generates glob）。
* 不存在/解析失败返回 []。
*/
async function readSchemaArtifacts(projectDir) {
	let names;
	try {
		names = await promises.readdir(join(projectDir, "openspec", "schemas"));
	} catch {
		return [];
	}
	for (const schemaDirName of names.sort()) {
		let content;
		try {
			content = await promises.readFile(join(projectDir, "openspec", "schemas", schemaDirName, "schema.yaml"), "utf8");
		} catch {
			continue;
		}
		const result = [];
		let inArtifacts = false;
		let pendingId = null;
		for (const rawLine of content.split(/\r?\n/u)) {
			if (/^\S/u.test(rawLine)) inArtifacts = rawLine.trimEnd() === "artifacts:";
			if (!inArtifacts) continue;
			const idMatch = /^\s*-\s+id:\s*(\S+)\s*$/u.exec(rawLine);
			if (idMatch !== null) {
				if (pendingId !== null) result.push({
					id: pendingId,
					generates: ""
				});
				pendingId = idMatch[1];
				continue;
			}
			const genMatch = /^\s*generates:\s*['"]?([^'"\n]+?)['"]?\s*$/u.exec(rawLine);
			if (genMatch !== null && pendingId !== null) {
				result.push({
					id: pendingId,
					generates: genMatch[1].trim()
				});
				pendingId = null;
			}
		}
		if (pendingId !== null) result.push({
			id: pendingId,
			generates: ""
		});
		if (result.length > 0) return result;
	}
	return [];
}
/** 简化 glob → RegExp（支持 ** 与 *，用于匹配 generates 模式）。 */
function globToRegExp(pattern) {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
	return new RegExp(`^${escaped}$`, "u");
}
/** 判断相对路径（change 目录内）是否匹配某个 generates 模式。 */
function matchesGlob(relPath, generates) {
	if (generates === "") return false;
	return globToRegExp(generates).test(relPath);
}
/**
* 递归列举 change 目录下全部产物文件（含子目录如 specs/<cap>/spec.md）。
* 隐藏文件与 node_modules 除外。
*/
async function listChangeFilesRecursively(changeDir, signal) {
	const out = [];
	const walk = async (dir, prefix) => {
		let entries;
		try {
			entries = await promises.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (signal?.aborted) return;
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const childPath = join(dir, entry.name);
			if (entry.isDirectory()) await walk(childPath, `${prefix}${entry.name}/`);
			else {
				const stat = await statFile(childPath);
				if (stat !== void 0) out.push({
					rel: `${prefix}${entry.name}`,
					path: childPath,
					stat
				});
			}
		}
	};
	await walk(changeDir, "");
	out.sort((a, b) => a.rel.localeCompare(b.rel));
	return out;
}
/** 读取一个 change 目录并汇总为进度摘要。 */
async function readChange(changeDir, changeName, schemaArtifacts, signal) {
	let tasksProgress = {
		done: 0,
		total: 0
	};
	const listed = await listChangeFilesRecursively(changeDir, signal);
	if (signal?.aborted) return null;
	const files = [];
	const matchedRels = /* @__PURE__ */ new Set();
	for (const artifact of schemaArtifacts) for (const { rel, path, stat } of listed) {
		if (matchedRels.has(rel)) continue;
		if (matchesGlob(rel, artifact.generates)) {
			matchedRels.add(rel);
			files.push({
				kind: artifact.id,
				label: rel,
				path,
				...stat
			});
		}
	}
	files.sort((a, b) => {
		const orderA = schemaArtifacts.findIndex((a2) => a2.id === a.kind);
		const orderB = schemaArtifacts.findIndex((b2) => b2.id === b.kind);
		return orderA === orderB ? a.label.localeCompare(b.label) : orderA - orderB;
	});
	const expected = schemaArtifacts.map((artifact) => ({
		id: artifact.id,
		satisfied: listed.some(({ rel }) => matchesGlob(rel, artifact.generates))
	}));
	const tasksArtifact = schemaArtifacts.find((a) => a.id === "tasks");
	const tasksFile = tasksArtifact !== void 0 ? listed.find(({ rel }) => matchesGlob(rel, tasksArtifact.generates)) : void 0;
	if (tasksFile !== void 0) try {
		tasksProgress = parseTasks(await promises.readFile(tasksFile.path, "utf8"));
	} catch {}
	const allSatisfied = expected.every((e) => e.satisfied);
	let status;
	if (tasksProgress.total > 0 && tasksProgress.done >= tasksProgress.total) status = "done";
	else if (tasksProgress.done > 0) status = "applying";
	else if (allSatisfied) status = "ready";
	else status = "designing";
	return {
		name: changeName,
		status,
		tasks: tasksProgress,
		files,
		expected
	};
}
/** 汇总一个 openspec 项目的所有 change（活跃 + 已归档）。 */
async function readProjectChanges(projectDir, signal) {
	const changesDir = join(projectDir, "openspec", "changes");
	let entries;
	try {
		entries = await promises.readdir(changesDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const schemaArtifacts = await readSchemaArtifacts(projectDir);
	const changes = [];
	for (const entry of entries) {
		if (signal?.aborted) break;
		if (!entry.isDirectory()) continue;
		if (entry.name === "archive") {
			const archiveDir = join(changesDir, "archive");
			let archivedEntries;
			try {
				archivedEntries = await promises.readdir(archiveDir, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const archived of archivedEntries) {
				if (signal?.aborted) break;
				if (!archived.isDirectory()) continue;
				const dateMatch = /^(\d{4}-\d{2}-\d{2})-(.+)$/u.exec(archived.name);
				const change = await readChange(join(archiveDir, archived.name), dateMatch?.[2] ?? archived.name, schemaArtifacts, signal);
				if (change !== null) {
					change.status = "archived";
					if (dateMatch !== null) change.archivedAt = dateMatch[1];
					changes.push(change);
				}
			}
			continue;
		}
		const change = await readChange(join(changesDir, entry.name), entry.name, schemaArtifacts, signal);
		if (change !== null) changes.push(change);
	}
	changes.sort((a, b) => {
		if (a.status !== "archived" && b.status !== "archived") return 0;
		if (a.status !== "archived") return -1;
		if (b.status !== "archived") return 1;
		return (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "");
	});
	return changes;
}
//#endregion
//#region src/host/api/wire.ts
/**
* `/openspec/api/*` 的 HTTP 传输层辅助：信任栅栏、JSON 信封读写、
* 预览文件类型判定与安全检查。
*/
/** 信任栅栏：只允许 loopback 浏览器来源。 */
function isTrustedApiRequest(hostHeader) {
	if (hostHeader === void 0) return false;
	const hostname = hostHeader.split(":")[0].toLowerCase();
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
/** 可预览的文件扩展名（产物常见类型；.html 通过 iframe 原始路由预览）。 */
const PREVIEWABLE_EXTENSIONS = /* @__PURE__ */ new Set([
	".md",
	".html",
	".htm",
	".yaml",
	".yml",
	".json",
	".txt",
	".js",
	".css"
]);
/** 判断路径是否为可预览类型。 */
function isPreviewablePath(filePath) {
	const dot = filePath.lastIndexOf(".");
	if (dot === -1) return false;
	return PREVIEWABLE_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}
/** 原始路由的 content-type。 */
function contentTypeFor(filePath) {
	const dot = filePath.lastIndexOf(".");
	const ext = dot === -1 ? "" : filePath.slice(dot).toLowerCase();
	if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
	if (ext === ".json") return "application/json; charset=utf-8";
	if (ext === ".yaml" || ext === ".yml") return "text/yaml; charset=utf-8";
	return "text/plain; charset=utf-8";
}
/**
* 校验一个文件是否在某个已注册工作区的 openspec/ 目录内、存在、
* 且小于大小上限。返回 stat 或 error（直接可用于 writeError）。
*/
async function checkPreviewableFile(ctx, filePath) {
	if (!ctx.workspaceRegistry.list().some((ws) => filePath.startsWith(join(ws.path, "openspec") + "/"))) return { error: {
		code: "forbidden",
		message: "path is outside any registered workspace openspec/ directory",
		status: 403
	} };
	let stat;
	try {
		stat = await promises.stat(filePath);
	} catch {
		return { error: {
			code: "not-found",
			message: "file not found",
			status: 404
		} };
	}
	if (!stat.isFile()) return { error: {
		code: "not-found",
		message: "not a file",
		status: 404
	} };
	const limit = filePath.endsWith(".js") || filePath.endsWith(".css") ? 1e7 : 2e6;
	if (stat.size > limit) return { error: {
		code: "too-large",
		message: `file larger than ${limit} bytes`,
		status: 413
	} };
	return { stat: {
		bytes: stat.size,
		mtime: stat.mtime.toISOString()
	} };
}
function writeJson(res, status, body) {
	const r = res;
	r.setHeader("content-type", "application/json");
	r.statusCode = status;
	r.end(JSON.stringify(body));
}
function writeOk(res, value) {
	writeJson(res, 200, {
		ok: true,
		value
	});
}
function writeError(res, code, message, status = 400) {
	writeJson(res, status, {
		ok: false,
		error: {
			code,
			message
		}
	});
}
/** 解析单个请求的 JSON body，带大小上限。 */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		size += buf.length;
		if (size > 1e6) throw new Error("payload too large");
		chunks.push(buf);
	}
	if (chunks.length === 0) return {};
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
/** 从 body 中取出必填的字符串字段，缺失/为空时抛错。 */
function requireString(body, key) {
	const value = body[key];
	if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string`);
	return value;
}
//#endregion
//#region src/host/api/handlers.ts
/**
* `/openspec/api/*` 各方法的具体实现（目录浏览/拾取、扫描导入、
* 移除、总览、文件读取、raw URL、提案会话绑定查询）。
* 由 routes.ts 的分发器调用。
*/
/** GET /dir.list —— 供导入选择器使用的、支持浏览能力的目录列表。 */
async function handleDirList(api, res, body) {
	const { ctx } = api;
	const path = typeof body.path === "string" && body.path !== "" ? body.path : void 0;
	const picker = ctx.get("directoryPicker");
	const capability = picker?.capability();
	if (picker === void 0 || capability === void 0 || capability.kind !== "browse") {
		writeError(res, "picker-unavailable", "directory browsing unavailable on this host", 501);
		return;
	}
	const listing = await capability.list(path);
	writeOk(res, {
		path: listing.path,
		home: listing.home,
		ancestors: listing.ancestors,
		entries: listing.entries.filter((entry) => !entry.hidden),
		truncated: listing.truncated ?? false
	});
}
/** POST /pick —— 通过宿主 directoryPicker 做一次系统文件夹选择。 */
async function handlePick(api, res) {
	const picker = api.ctx.get("directoryPicker");
	const capability = picker?.capability();
	if (picker === void 0 || capability === void 0) {
		writeError(res, "picker-unavailable", "directory picker unavailable on this host", 501);
		return;
	}
	if (capability.kind !== "native") {
		writeError(res, "pick-unsupported", "host picker is browse-only; use the in-app browser", 501);
		return;
	}
	writeOk(res, { path: await capability.pick(new AbortController().signal) ?? null });
}
/** 把一个项目导入工作区注册表 + 偏好索引（幂等）。 */
async function importProject(api, projectPath) {
	const { ctx } = api;
	const existing = ctx.workspaceRegistry.list().find((ws) => ws.path === projectPath);
	if (existing === void 0) await ctx.workspaceRegistry.create(projectPath, basename(projectPath) || projectPath);
	const prefs = api.readPrefs();
	if (!prefs.projects.includes(projectPath)) await api.writePrefs({
		...prefs,
		projects: [...prefs.projects, projectPath]
	});
	return { workspaceExisted: existing !== void 0 };
}
/** POST /scanAndImportAll —— 递归扫描选定根目录并导入其下所有项目。 */
async function handleScanAndImportAll(api, res, body) {
	const rootDir = requireString(body, "path");
	const rootStat = await promises.stat(rootDir).catch(() => void 0);
	if (rootStat === void 0 || !rootStat.isDirectory()) {
		writeError(res, "not-a-directory", `${rootDir} is not a readable directory`);
		return;
	}
	const projects = await scanOpenspecProjects(rootDir, void 0, api.scanDepth);
	const imported = [];
	const existing = [];
	const failed = [];
	for (const project of projects) try {
		const alreadyWorkspace = api.ctx.workspaceRegistry.list().some((ws) => ws.path === project.path);
		await importProject(api, project.path);
		(alreadyWorkspace ? existing : imported).push(project.path);
	} catch (error) {
		failed.push({
			path: project.path,
			message: error instanceof Error ? error.message : String(error)
		});
	}
	await api.writePrefs({
		...api.readPrefs(),
		lastScanRoot: rootDir
	});
	writeOk(res, {
		root: rootDir,
		count: projects.length,
		imported,
		existing,
		failed,
		projects
	});
}
/** POST /scan —— 只扫描不导入，返回发现的项目列表。 */
async function handleScan(api, res, body) {
	const rootDir = requireString(body, "path");
	const projects = await scanOpenspecProjects(rootDir, void 0, api.scanDepth);
	await api.writePrefs({
		...api.readPrefs(),
		lastScanRoot: rootDir
	});
	writeOk(res, {
		root: rootDir,
		projects
	});
}
/** POST /import —— 导入单个项目目录。 */
async function handleImport(api, res, body) {
	const rootDir = requireString(body, "path");
	const stat = await promises.stat(join(rootDir, "openspec", "changes")).catch(() => void 0);
	if (stat === void 0 || !stat.isDirectory()) {
		writeError(res, "not-openspec", `${rootDir} is not an OpenSpec project (openspec/changes missing)`);
		return;
	}
	const { workspaceExisted } = await importProject(api, rootDir);
	writeOk(res, {
		imported: rootDir,
		workspaceExisted
	});
}
/** POST /remove —— 从偏好索引和工作区注册表中同时移除。 */
async function handleRemove(api, res, body) {
	const rootDir = requireString(body, "path");
	const prefs = api.readPrefs();
	await api.writePrefs({
		...prefs,
		projects: prefs.projects.filter((p) => p !== rootDir)
	});
	const ws = api.ctx.workspaceRegistry.list().find((w) => w.path === rootDir);
	if (ws !== void 0) await api.ctx.workspaceRegistry.delete(ws.id);
	writeOk(res, {
		removed: rootDir,
		workspaceDeleted: ws !== void 0
	});
}
/** POST /overview —— 权威数据源 = 工作区注册表，附带提案进度与绑定标记。 */
async function handleOverview(api, res) {
	const { ctx } = api;
	const workspaces = ctx.workspaceRegistry.list();
	const all = await Promise.all(workspaces.map(async (ws) => ({
		ws,
		changes: await readProjectChanges(ws.path),
		isOpenspec: await isOpenspecProject(ws.path)
	})));
	const registryPaths = new Set(workspaces.map((ws) => ws.path));
	const prefs = api.readPrefs();
	const reconciled = prefs.projects.filter((p) => registryPaths.has(p));
	for (const entry of all) if (entry.isOpenspec && !reconciled.includes(entry.ws.path)) reconciled.push(entry.ws.path);
	if (reconciled.length !== prefs.projects.length || reconciled.some((p, i) => p !== prefs.projects[i])) await api.writePrefs({
		...prefs,
		projects: reconciled
	});
	const openspecProjects = all.filter((entry) => entry.isOpenspec).map((entry) => ({
		path: entry.ws.path,
		name: entry.ws.title || basename(entry.ws.path) || entry.ws.path,
		workspaceId: entry.ws.id,
		sessionIds: [...entry.ws.sessionIds],
		stillValid: entry.isOpenspec,
		changes: entry.changes
	}));
	await api.bindings.reconcile(openspecProjects);
	const markers = await Promise.all(openspecProjects.map(async (project) => {
		const map = {};
		for (const change of project.changes) {
			const marker = await api.bindings.readMarker(join(project.path, "openspec", "changes", change.name));
			if (marker !== void 0) map[change.name] = marker;
		}
		return map;
	}));
	let index = 0;
	for (const project of openspecProjects) {
		project.changeSessions = markers[index];
		index += 1;
	}
	writeOk(res, { projects: openspecProjects });
}
/** POST /file.read —— 读取一个产物文件的内容用于预览（带安全栅栏）。 */
async function handleFileRead(api, res, body) {
	const filePath = requireString(body, "path");
	if (!isPreviewablePath(filePath)) {
		writeError(res, "forbidden", "file type not previewable", 403);
		return;
	}
	const check = await checkPreviewableFile(api.ctx, filePath);
	if (check.error !== void 0) {
		writeError(res, check.error.code, check.error.message, check.error.status);
		return;
	}
	const content = await promises.readFile(filePath, "utf8");
	writeOk(res, {
		path: filePath,
		bytes: check.stat.bytes,
		mtime: check.stat.mtime,
		content
	});
}
/** POST /raw.url —— 把产物绝对路径解析成 /openspec/api/raw/ 的预览 URL。 */
async function handleRawUrl(api, res, body) {
	const filePath = requireString(body, "path");
	const ws = api.ctx.workspaceRegistry.list().find((w) => filePath.startsWith(join(w.path, "openspec") + "/"));
	if (ws === void 0) {
		writeError(res, "forbidden", "path is outside any registered workspace openspec/ directory", 403);
		return;
	}
	if (!isPreviewablePath(filePath)) {
		writeError(res, "forbidden", "file type not previewable", 403);
		return;
	}
	const check = await checkPreviewableFile(api.ctx, filePath);
	if (check.error !== void 0) {
		writeError(res, check.error.code, check.error.message, check.error.status);
		return;
	}
	const relPath = filePath.slice(join(ws.path, "openspec").length + 1);
	const wsId = Buffer.from(ws.path, "utf8").toString("base64");
	writeOk(res, { url: `/openspec/api/raw/${encodeURIComponent(wsId)}/${relPath.split("/").map(encodeURIComponent).join("/")}` });
}
/** POST /changeSession.bind —— 记录待绑定（提案目录出现后由对账落盘）。 */
async function handleChangeSessionBind(api, res, body) {
	const projectPath = requireString(body, "projectPath");
	const sessionId = requireString(body, "sessionId");
	api.bindings.bindLater(projectPath, sessionId);
	writeOk(res, {
		projectPath,
		sessionId
	});
}
/** POST /changeSession.get —— 查询提案绑定的会话 id（先对账再读标记）。 */
async function handleChangeSessionGet(api, res, body) {
	const projectPath = requireString(body, "projectPath");
	const changeName = requireString(body, "changeName");
	const changes = await readProjectChanges(projectPath).catch(() => []);
	await api.bindings.reconcile([{
		path: projectPath,
		changes
	}]);
	writeOk(res, { sessionId: await api.bindings.readMarker(join(projectPath, "openspec", "changes", changeName)) ?? null });
}
//#endregion
//#region src/host/api/routes.ts
/**
* `/openspec/api/*` 路由：信任栅栏、raw 文件子路由与 JSON 方法分发。
*/
/**
* GET /openspec/api/raw/<wsId>/<openspec 内相对路径> —— 原始文件
* 路由，供 iframe 预览 design.html 等交互产物。把路径编进 URL
* path（而非 query），iframe 内的相对引用（../../mermaid.min.js）
* 会被浏览器相对此 URL 正确解析到同一路由下的真实文件位置。
*/
async function serveRawFile(ctx, res, pathname) {
	const rest = pathname.slice(18);
	const slash = rest.indexOf("/");
	if (slash === -1) {
		writeError(res, "bad-request", "missing path", 400);
		return;
	}
	const wsId = decodeURIComponent(rest.slice(0, slash));
	const relPath = decodeURIComponent(rest.slice(slash + 1));
	let ws = ctx.workspaceRegistry.list().find((w) => w.id === wsId);
	if (ws === void 0) try {
		const decodedPath = Buffer.from(wsId, "base64").toString("utf8");
		ws = ctx.workspaceRegistry.list().find((w) => w.path === decodedPath);
	} catch {}
	if (ws === void 0) {
		writeError(res, "not-found", "unknown workspace", 404);
		return;
	}
	const filePath = join(ws.path, "openspec", relPath);
	if (!filePath.startsWith(join(ws.path, "openspec") + "/")) {
		writeError(res, "forbidden", "path escapes openspec/ directory", 403);
		return;
	}
	if (!isPreviewablePath(filePath)) {
		writeError(res, "forbidden", "file type not previewable", 403);
		return;
	}
	const check = await checkPreviewableFile(ctx, filePath);
	if (check.error !== void 0) {
		writeError(res, check.error.code, check.error.message, check.error.status);
		return;
	}
	const content = await promises.readFile(filePath);
	const r = res;
	r.setHeader("content-type", contentTypeFor(filePath));
	r.statusCode = 200;
	r.end(content);
}
/** 在 ctx 上注册 /openspec/api 前缀路由（供 apply 调用）。 */
function registerApiRoutes(ctx, scanDepth) {
	ctx.inject(["settings"], (sctx) => {
		const prefsScope = createPrefsScope(sctx.settings);
		const api = {
			ctx,
			readPrefs: () => prefsScope.get(),
			writePrefs: (patch) => updatePrefs(sctx.settings, patch),
			bindings: new ChangeSessionBindings(),
			scanDepth
		};
		ctx.effect(() => ctx.webServer.register({
			kind: "prefix",
			path: "/openspec/api",
			handler: async (req, res) => {
				if (!isTrustedApiRequest(req.headers?.host)) {
					writeError(res, "forbidden", "forbidden", 403);
					return;
				}
				const url = new URL(req.url ?? "/", "http://localhost");
				if (req.method === "GET" && url.pathname.startsWith("/openspec/api/raw/")) {
					await serveRawFile(ctx, res, url.pathname);
					return;
				}
				const method = url.pathname.replace(/^\/openspec\/api\//u, "");
				try {
					if (method === "prefs.get") {
						writeOk(res, api.readPrefs());
						return;
					}
					const body = await readJsonBody(req);
					switch (method) {
						case "dir.list": return await handleDirList(api, res, body);
						case "pick": return await handlePick(api, res);
						case "scanAndImportAll": return await handleScanAndImportAll(api, res, body);
						case "scan": return await handleScan(api, res, body);
						case "import": return await handleImport(api, res, body);
						case "remove": return await handleRemove(api, res, body);
						case "overview": return await handleOverview(api, res);
						case "file.read": return await handleFileRead(api, res, body);
						case "raw.url": return await handleRawUrl(api, res, body);
						case "changeSession.bind": return await handleChangeSessionBind(api, res, body);
						case "changeSession.get": return await handleChangeSessionGet(api, res, body);
						default: writeError(res, "unknown-method", `unknown method ${method}`, 404);
					}
				} catch (error) {
					writeError(res, "error", error instanceof Error ? error.message : String(error));
				}
			}
		}));
	});
}
//#endregion
//#region src/index.ts
/**
* dsh-openspec-suite 宿主半入口。
*
* 挂在 `/openspec/api/*` 下的 OpenSpec 管理 API（仅限 loopback 的信任
* 栅栏）：文件夹扫描、工作区导入、按项目统计提案进度。
* 具体实现按功能拆分在 ./host/ 下：
* - scan.ts                    OpenSpec 项目发现（目录扫描）
* - changes.ts                 提案进度（状态/产物/任务解析）
* - prefs.ts                   设置命名空间与偏好读写
* - change-session-bindings.ts 提案 → 会话绑定（标记文件 + 对账）
* - api-handlers.ts            各 API 方法的业务实现
* - routes.ts                  HTTP 路由注册与分发
* - wire.ts                    传输层辅助（栅栏/信封/校验）
*/
/** 插件标识，用于 cordis.yml 的行。 */
const name = "dsh-openspec-suite";
/** 挂载前需要的服务。 */
const inject = [
	"webServer",
	"sessions",
	"workspaceRegistry"
];
const Config = z.object({ scanDepth: z.number().step(1).min(1).max(8).default(4) });
function apply(ctx, config) {
	registerApiRoutes(ctx, config.scanDepth ?? 4);
}
//#endregion
export { Config, apply, inject, name, readProjectChanges, scanOpenspecProjects };
