const PERIODS = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night', 'midnight'];
const WEATHERS = ['clear', 'cloudy', 'rain', 'snow', 'fog', 'storm'];

const PERIOD_LABELS = {
  dawn: '清晨',
  morning: '上午',
  noon: '正午',
  afternoon: '下午',
  dusk: '黄昏',
  night: '夜晚',
  midnight: '深夜'
};

const WEATHER_LABELS = {
  clear: '晴',
  cloudy: '阴',
  rain: '雨',
  snow: '雪',
  fog: '雾',
  storm: '暴雨'
};

function createSceneManager() {
  const locations = new Map();
  let currentLocation = null;
  let currentPeriod = 'morning';
  let currentWeather = 'clear';
  const changeTrail = [];
  const subscribers = new Set();

  function isValidPeriod(p) {
    return PERIODS.includes(p);
  }

  function isValidWeather(w) {
    return WEATHERS.includes(w);
  }

  function validateLocationDef(def) {
    if (typeof def?.name !== 'string' || def.name.length === 0) return false;
    if (typeof def?.backgrounds !== 'object' || def.backgrounds === null) return false;
    if (typeof def.backgrounds.default !== 'string' || def.backgrounds.default.length === 0) return false;
    for (const [key, value] of Object.entries(def.backgrounds)) {
      if (typeof value !== 'string' || value.length === 0) return false;
    }
    return true;
  }

  function notifyChange() {
    const snapshot = getStateSnapshot();
    for (const cb of subscribers) {
      try {
        cb(snapshot);
      } catch (_) {
        // ignore callback errors
      }
    }
  }

  function getStateSnapshot() {
    return {
      location: currentLocation,
      locationName: currentLocation ? locations.get(currentLocation).name : null,
      time: currentPeriod,
      weather: currentWeather,
      background: resolveBackground()
    };
  }

  function recordTrail() {
    changeTrail.push({
      location: currentLocation,
      time: currentPeriod,
      weather: currentWeather
    });
    if (changeTrail.length > 100) {
      changeTrail.shift();
    }
  }

  function defineLocation(id, def) {
    if (typeof id !== 'string' || id.length === 0) return false;
    if (!validateLocationDef(def)) return false;
    locations.set(id, { name: def.name, backgrounds: { ...def.backgrounds } });
    return true;
  }

  function enter(id) {
    if (!locations.has(id)) return false;
    if (currentLocation === id) return true;
    currentLocation = id;
    recordTrail();
    notifyChange();
    return true;
  }

  function setTime(period) {
    if (!isValidPeriod(period)) return false;
    if (currentPeriod === period) return true;
    currentPeriod = period;
    recordTrail();
    notifyChange();
    return true;
  }

  function setWeather(weather) {
    if (!isValidWeather(weather)) return false;
    if (currentWeather === weather) return true;
    currentWeather = weather;
    recordTrail();
    notifyChange();
    return true;
  }

  function resolveBackground() {
    if (!currentLocation) return null;
    const loc = locations.get(currentLocation);
    const backgrounds = loc.backgrounds;
    if (backgrounds[currentPeriod]) return backgrounds[currentPeriod];
    if (backgrounds[currentWeather]) return backgrounds[currentWeather];
    return backgrounds.default;
  }

  function state() {
    return getStateSnapshot();
  }

  function describe() {
    const locName = currentLocation ? locations.get(currentLocation).name : '未知之地';
    const periodLabel = PERIOD_LABELS[currentPeriod];
    const weatherLabel = WEATHER_LABELS[currentWeather];
    return `${locName} · ${periodLabel} · ${weatherLabel}`;
  }

  function trail() {
    return changeTrail.map(entry => ({ ...entry }));
  }

  function onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }

  return {
    defineLocation,
    enter,
    setTime,
    setWeather,
    resolveBackground,
    state,
    describe,
    trail,
    onChange
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createSceneManager };
}