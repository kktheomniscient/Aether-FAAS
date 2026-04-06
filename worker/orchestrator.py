from rq import Connection, Queue, Worker

from worker.connections import redis_connection


def main() -> None:
    with Connection(redis_connection):
        worker = Worker([Queue("default")], connection=redis_connection)
        worker.work()


if __name__ == "__main__":
    main()
