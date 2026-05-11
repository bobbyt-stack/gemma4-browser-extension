import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from trillim import LLM, Server


def main():
    parser = argparse.ArgumentParser(
        description="Run the Trillim backend for the browser extension."
    )
    parser.add_argument("--model", default="Trillim/Bonsai-4BT-TRNQ")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    parser.add_argument("--num-threads", default=0, type=int)
    parser.add_argument("--trust-remote-code", action="store_true")
    args = parser.parse_args()

    server = Server(
        LLM(
            args.model,
            num_threads=args.num_threads,
            trust_remote_code=args.trust_remote_code,
        )
    )
    server.app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    log_path = Path(__file__).resolve().parent / "logs" / "trillim-prompts.jsonl"

    @server.app.post("/debug/prompt-log")
    async def write_prompt_log(request: Request):
        payload = await request.json()
        entry = {
            "timestamp": datetime.now(UTC).isoformat(),
            **payload,
        }
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return {"status": "ok"}

    server.run(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
