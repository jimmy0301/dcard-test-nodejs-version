const emailValidator = (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).send('Invalid email format');

    return;
  }

  if (
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(
      email
    )
  ) {
    next();
  } else {
    res.status(400).send('Invalid email format');
  }
};

export default emailValidator;
