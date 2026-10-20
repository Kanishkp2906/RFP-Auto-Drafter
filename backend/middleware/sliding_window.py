SLIDING_WINDOW_SCRIPT = """
local key = KEYS[1]
local window_ms = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000
    + math.floor(tonumber(time[2]) / 1000)

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window_ms)

local count = redis.call('ZCARD', key)

if count >= limit then
    local oldest = redis.call(
        'ZRANGE', key, 0, 0, 'WITHSCORES'
    )
    local retry_ms = tonumber(oldest[2]) + window_ms - now
    return {0, math.max(1, math.ceil(retry_ms / 1000))}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window_ms)

return {1, 0}
"""
