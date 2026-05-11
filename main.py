import argparse

from fastapi.middleware.cors import CORSMiddleware
from trillim import LLM, Server


def main():
    parser = argparse.ArgumentParser(
        description="Run the Trillim backend for the browser extension."
    )
    parser.add_argument("--model", default="Trillim/BitNet-TRNQ")
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
    server.run(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
