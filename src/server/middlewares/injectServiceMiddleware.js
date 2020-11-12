function injectService(name, obj) {
  return async (req, res, next) => {
    if (!req[name]) {
      req[name] = obj;
    }
    next();
  };
}

export default injectService;
