const passswordValidator = (req, res, next) => {
  const { password } = req.body;

  if (!password) {
    res.status(400).send('Invalid password format');

    return;
  }

  if (password.length < 6 || password.length > 16) {
    res.status(400).send('Invalid password format');

    return;
  }

  if (/^[a-z0-9]+$/i.test(password)) {
    next();
  } else {
    res.status(400).send('Invalid password format');
  }
};

export default passswordValidator;
