// Bu script bcrypt ile admin şifresini hash'ler ve sonucu ekrana basar
import bcrypt from 'bcrypt';

const password = 'Murat-17';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, function(err, hash) {
  if (err) throw err;
  console.log('Hash:', hash);
});
