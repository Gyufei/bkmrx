#!/usr/bin/env python3
"""Check bookmark URLs and write Markdown and JSON reports."""

from __future__ import annotations

import argparse
import json
import socket
import ssl
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


USER_AGENT = "Mozilla/5.0 (compatible; bkmrx-dead-url-checker/1.0)"
DEAD_STATUSES = {404, 410}
RETRY_STATUSES = {408, 425, 429, 500, 502, 503, 504}


@dataclass
class Result:
    title: str
    url: str
    tags: list[str]
    category: str
    status: int | None = None
    final_url: str | None = None
    error: str | None = None
    attempts: int = 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Exported bookmarks JSON")
    parser.add_argument("--output", type=Path, required=True, help="Markdown report path")
    parser.add_argument("--json-output", type=Path, help="Optional full JSON result path")
    parser.add_argument("--workers", type=int, default=12, help="Concurrent requests (default: 12)")
    parser.add_argument("--timeout", type=float, default=15, help="Request timeout in seconds (default: 15)")
    parser.add_argument("--retries", type=int, default=1, help="Retries after transient failures (default: 1)")
    return parser.parse_args()


def load_bookmarks(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    bookmarks = data.get("bookmarks") if isinstance(data, dict) else None
    if not isinstance(bookmarks, list):
        raise ValueError("Input JSON must contain a 'bookmarks' array")
    return [item for item in bookmarks if isinstance(item, dict)]


def error_text(exc: BaseException) -> str:
    reason = exc.reason if isinstance(exc, URLError) else exc
    return f"{type(reason).__name__}: {reason}"


def check_bookmark(bookmark: dict[str, Any], timeout: float, retries: int) -> Result:
    url = str(bookmark.get("url") or "").strip()
    title = str(bookmark.get("title") or "(untitled)")
    tags = [str(tag) for tag in bookmark.get("tags", []) if tag]
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return Result(title, url, tags, "dead", error="Invalid or unsupported URL")

    last_error: str | None = None
    for attempt in range(1, retries + 2):
        try:
            request = Request(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
                method="GET",
            )
            with urlopen(request, timeout=timeout) as response:
                response.read(1)
                status = response.status
                final_url = response.geturl()
            category = "alive" if 200 <= status < 400 else "review"
            return Result(title, url, tags, category, status, final_url, attempts=attempt)
        except HTTPError as exc:
            status = exc.code
            if status in RETRY_STATUSES and attempt <= retries:
                time.sleep(attempt)
                continue
            category = "dead" if status in DEAD_STATUSES else "review"
            return Result(title, url, tags, category, status, exc.geturl(), str(exc.reason), attempt)
        except (URLError, TimeoutError, socket.timeout, ssl.SSLError, OSError) as exc:
            last_error = error_text(exc)
            if attempt <= retries:
                time.sleep(attempt)
                continue
            return Result(title, url, tags, "review", error=last_error, attempts=attempt)
        except Exception as exc:  # Keep one unusual URL from aborting the whole scan.
            return Result(title, url, tags, "review", error=error_text(exc), attempts=attempt)

    return Result(title, url, tags, "review", error=last_error, attempts=retries + 1)


def md_escape(value: Any) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ")


def write_markdown(path: Path, results: list[Result], source: Path, checked_at: str) -> None:
    dead = [result for result in results if result.category == "dead"]
    review = [result for result in results if result.category == "review"]
    alive = len(results) - len(dead) - len(review)
    lines = [
        "# Dead URL 检测报告",
        "",
        f"- 检测时间：{checked_at}",
        f"- 来源文件：`{source}`",
        f"- 总数：{len(results)}",
        f"- 可访问：{alive}",
        f"- 确定失效：{len(dead)}",
        f"- 需人工复核：{len(review)}",
        "",
        "## 确定失效",
        "",
        "| 标题 | URL | 状态/错误 | 标签 |",
        "| --- | --- | --- | --- |",
    ]
    for item in dead:
        detail = f"HTTP {item.status}" if item.status else item.error
        lines.append(f"| {md_escape(item.title)} | {md_escape(item.url)} | {md_escape(detail)} | {md_escape(', '.join(item.tags))} |")
    if not dead:
        lines.append("| — | — | 未发现 | — |")

    lines.extend([
        "",
        "## 需人工复核",
        "",
        "> 这些地址可能受登录、限流、机器人验证或临时网络故障影响，不应直接视为失效。",
        "",
        "| 标题 | URL | 状态/错误 | 最终 URL | 标签 |",
        "| --- | --- | --- | --- | --- |",
    ])
    for item in review:
        detail = f"HTTP {item.status}: {item.error or ''}".rstrip(": ") if item.status else item.error
        lines.append(
            f"| {md_escape(item.title)} | {md_escape(item.url)} | {md_escape(detail)} | "
            f"{md_escape(item.final_url)} | {md_escape(', '.join(item.tags))} |"
        )
    if not review:
        lines.append("| — | — | 未发现 | — | — |")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    if args.workers < 1 or args.timeout <= 0 or args.retries < 0:
        raise SystemExit("workers and timeout must be positive; retries cannot be negative")

    bookmarks = load_bookmarks(args.input)
    results: list[Result | None] = [None] * len(bookmarks)
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(check_bookmark, bookmark, args.timeout, args.retries): index
            for index, bookmark in enumerate(bookmarks)
        }
        completed = 0
        for future in as_completed(futures):
            results[futures[future]] = future.result()
            completed += 1
            if completed % 100 == 0 or completed == len(bookmarks):
                print(f"Checked {completed}/{len(bookmarks)}", flush=True)

    final_results = [result for result in results if result is not None]
    checked_at = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    write_markdown(args.output, final_results, args.input, checked_at)
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        payload = {"checked_at": checked_at, "source": str(args.input), "results": [asdict(item) for item in final_results]}
        args.json_output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    counts = {name: sum(item.category == name for item in final_results) for name in ("alive", "dead", "review")}
    print(f"Done: {counts['alive']} alive, {counts['dead']} dead, {counts['review']} review")
    print(f"Markdown: {args.output}")
    if args.json_output:
        print(f"JSON: {args.json_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
