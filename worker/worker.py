from redis import Redis
from rq import Worker, Queue, Connection

if __name__ == '__main__':
    print("here1")
    conn = Redis.from_url("redis://redis:6379/0")
    with Connection(conn):
        worker = Worker(Queue("default"))
        worker.work()