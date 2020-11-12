local redisKey = KEYS[1]
local currentTime = tonumber(ARGV[1])
local requestLimit = tonumber(ARGV[2])
local expiredTimeInterval = tonumber(ARGV[3])
local userInfo = redis.call('HGETALL', redisKey)
local resetTime = tonumber(userInfo[4])
local result = {}

if #userInfo == 0 or resetTime < currentTime then
  resetTime = currentTime + expiredTimeInterval
  redis.call('HMSET', redisKey, "requestTimes", 1, "resetTime", resetTime)
  result[1] = requestLimit - 1
  result[2] = resetTime
else
  local requestTimes = tonumber(userInfo[2])
  if requestTimes < requestLimit then
    local newRequestTimes = redis.call('HINCRBY', redisKey, "requestTimes", 1)
    result[1] = requestLimit - newRequestTimes
    result[2] = resetTime
  else
    result[1] = -1
    result[2] = resetTime
  end
end

return result
