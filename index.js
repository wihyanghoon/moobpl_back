const express = require('express')
const app = express();
const bcrypt = require('bcrypt')
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser')
const session = require('express-session')
const { v4 } = require('uuid')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const cors = require('cors')
const ObjectId = require('mongodb').ObjectId;
dotenv.config();


app.use(cors({
    origin: ['http://localhost:3000', 'https://localhost:3000/'],
    credentials: true,
}))
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser())
app.use(session({
    saveUninitialized: false,
    resave: false,
    secret: process.env.COOKIE_SECRET,
    proxy: true,
    cookie: {
        httpOnly: true,
        secure: true,
        maxAge: 3153600,
        sameSite: "none",
    }
}));

app.use(passport.initialize())
app.use(passport.session())

const Port = process.env.PORT || 8080;

let db
const MongoClient = require('mongodb').MongoClient // mongodb
MongoClient.connect(process.env.DB_URL, { useUnifiedTopology: true }, function (error, client) {

    if (error) return console.log(error)
    db = client.db("moobpl")

    app.listen(Port, function () {
        console.log("8080 서버실행중")
    })
})

app.get('/', (req, res) => {
    res.status(200).json({
        message: "sopt 서버 여러분 안녕하세요~,sopt-Media에 좋아요와 댓글 부탁드립니다!!(꾸벅)",
    })
})

app.post('/user/signup', async (req, res) => {
    try {
        const exUser = await db.collection('user').findOne({
            email: req.body.email
        })
        if (exUser) {
            return res.status(403).send("이미 사용중인 아이디 입니다.");
        }
        const hashedPassword = await bcrypt.hash(req.body.password, 12);
        await db.collection('user').insertOne({
            nickName: req.body.nickName,
            email: req.body.email,
            password: hashedPassword,
        })
        res.status(200).send({ message: '성공했습니다.' });
    } catch (error) {
        console.error(error)
    }
})

app.post('/user/login', isNotlogin, (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error(err);
            return next(err)
        }

        if (info) {
            return res.status(403).send(info.reason)
        }

        return req.login(user, async (loginErr) => {
            if (loginErr) {
                console.error(loginErr)
                return next(loginErr)
            }

            return res.status(200).json(user)
        })
    })(req, res, next);
});

passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    session: true,
    passReqToCallback: false,
}, async (username, password, done) => {

    try {
        const user = await db.collection('user').findOne({ email: username })
        if (!user) {
            return done(null, false, { reason: '존재하지 않는 이메일 입니다!' })
        }
        const result = await bcrypt.compare(password, user.password)

        if (result) {
            return done(null, user)
        }
        return done(null, false, { reason: '비밀번호가 틀렸습니다.' })
    } catch (error) {
        console.error(error);
        return done(error);
    }

}));


function islogin(req, res, next) {
    if (req.user) {
        next()
    } else {
        res.send('로그인 안했어요')
    }
}

function isNotlogin(req, res, next) {
    if (!req.user) {
        next()
    } else {
        res.send('로그인 했어요')
    }
}

// session에 저장하는 기능을 합니다.
passport.serializeUser(function (user, done) { // function('db result 값', done)
    done(null, user.email)
});

passport.deserializeUser(function (id, done) {
    db.collection('user').findOne({ email: id }, function (에러, 결과) {
        console.log("디시리얼라이즈")
        done(null, 결과)
    })
});

app.post('/user/logout', islogin, (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.send("로그아웃 됐습니다.");
        });
    });
})

app.get('/user', async (req, res, next) => {
    try {
        if (req.user) {
            console.log(req.user)
            const user = await db.collection('user').findOne({
                email: req.user.email
            })
            res.status(200).json(user)
        } else {
            res.status(200).json(null)
        }
    } catch (error) {
        console.error(error)
    }
})

app.get('/plan', async (req, res) => {
    try {
        const plans = await db.collection('post').find({ id: req.user.email }).toArray()
        if (plans) {
            res.status(200).json(plans)
        } else {
            res.status(200).send({ message: '게시물이 없습니다.' });
        }
    } catch (error) {
        console.error(error)
    }
})

app.patch('/user', async (req, res) => {
    try {
        const updateUser = await db.collection('user').updateOne(
            { email: req.user.email },
            { $set: { nickName: req.body.nickname } }
        )
        const updateNick = await db.collection('user').findOne(
            { email: req.user.email }
        )
        console.log(updateNick.nickname)
        res.status(200).json(updateUser.nickName)
    } catch (error) {
        console.error(error)
    }
})

app.post('/plan', async (req, res) => {
    try {
        const plan = await db.collection('post').insertOne({
            id: req.body.id,
            reigon: req.body.region,
            date: req.body.date,
            checkList: req.body.checkList,
            todos: req.body.todos
        })
        res.status(200).json(plan.ops[0]);
    } catch (error) {
        console.error(error)
    }
})

app.delete('/plan/:id', async (req, res) => {
    try {
        await db.collection('post').deleteOne(
            { _id: ObjectId(req.params.id) }
        )
        res.status(200).send({ message: '삭제완료.' });
    } catch (error) {
        console.error(error)
    }
})

app.patch('/plan/:id/todos', async (req, res) => {
    try {
        const uuid = () => {
            const tokens = v4().split('-')
            return tokens[2] + tokens[1] + tokens[0] + tokens[3] + tokens[4];
        }
        await db.collection('post').updateOne(
            { _id: ObjectId(req.params.id) },
            { $set: { todos: { date: req.body.date, _id: uuid(), todo: req.body.todo } } }
        )
        res.send({ message: "성공" })
    } catch (error) {
        console.error(error)
    }
})

app.patch('/plan/:id/checklist', async (req, res) => {
    console.log(req.body.checkList)
    console.log(req.params.id)
    try {
        await db.collection('post').updateOne(
            { _id: ObjectId(req.params.id) },
            { $set: { checkList: req.body.checkList } }
        )
        const findUpdateCheckList = await db.collection('post').findOne(
            { _id: ObjectId(req.params.id) }
        )
        console.log(findUpdateCheckList)
        res.status(200).json(findUpdateCheckList);
    } catch (error) {
        console.error(error)
    }
})