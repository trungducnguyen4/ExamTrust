#!/usr/bin/env node
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }

  const toolInput = input.tool_input || {};
  const paths = [];
  if (toolInput.file_path) paths.push(toolInput.file_path);
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) {
      if (e && e.file_path) paths.push(e.file_path);
    }
  }

  const norm = (p) => String(p).replace(/\\/g, "/");
  const isRelevant = (p) => {
    const path = norm(p);
    if (/\/FE\/src\/(app|features|components|hooks)\//.test(path)) return true;
    if (/\/BE\/src\/.*\.(service|controller)\.ts$/.test(path)) return true;
    return false;
  };

  if (!paths.some(isRelevant)) process.exit(0);

  const output = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        "Bạn vừa sửa file có thể liên quan tới nhiều role (admin/lecturer/student). Hãy dùng skill 'sync-role-screens' (Skill tool, skill name: sync-role-screens) để trace và đồng bộ các màn/role khác trước khi kết thúc task, bao gồm double-check bằng graphify (graphify query/path/explain trên .graphify/).",
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
});
