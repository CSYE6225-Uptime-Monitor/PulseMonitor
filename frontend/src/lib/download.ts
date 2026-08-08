// A one-line seam: useExports() calls this instead of window.location
// directly, so tests can mock it and assert the presigned URL was actually
// used, without navigating the test environment.
//
// GET /v1/user/self/exports/:id/download returns the presigned URL inside
// the normal {success,data,error} JSON envelope (not a 302) precisely so
// api.ts's fetch() call for *that* request never has to follow a redirect
// cross-origin to S3. Once we have the URL in hand, though, the actual file
// download must be a plain top-level navigation, not another fetch(): S3
// never sends Access-Control-Allow-Credentials, so a credentialed fetch to
// it would fail regardless. location.assign (not window.open) starts the
// download without unloading the current page and isn't activation-gated,
// so it still works after the `await` for the JSON response.
export function startDownload(url: string): void {
  window.location.assign(url);
}
