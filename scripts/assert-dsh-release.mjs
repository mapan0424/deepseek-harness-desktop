const registryBase = "https://registry.npmjs.org";

/**
 * Fail before a platform runtime is removed when the requested upstream DSH
 * release has not reached the npm registry yet.
 */
export async function assertDshReleasePublished(version) {
  const packageName = "@deepseek-ai/dsh";
  const encodedName = encodeURIComponent(packageName);
  const url = `${registryBase}/${encodedName}/${encodeURIComponent(version)}`;
  let response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (error) {
    throw new Error(
      `无法检查 ${packageName}@${version} 是否已发布：${error instanceof Error ? error.message : error}`,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(
      `${packageName}@${version} 尚未在 npm registry 发布（HTTP ${response.status}）。` +
        "请等待上游发布后再准备 bundled runtime。",
    );
  }
}
