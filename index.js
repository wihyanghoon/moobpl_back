const express = require('express')
const app = express();
const bcrypt = require('bcrypt')
const dotenv = require('dotenv');
const path = require('path');
const cookieParser = require('cookie-parser')
const session = require('express-session')
const { v4 } = require('uuid')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const cors = require('cors')
const ObjectId = require('mongodb').ObjectId;
dotenv.config();


app.use(cors({
    origin: true,
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
        httpOnly : false,
        sameSite : 'None',
        maxAge : 5300000,
        secure : true,
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

app.use(express.static(path.join(__dirname, 'build')));

app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'build/index.html'));
});

app.get('/api', (req, res) => {
    res.status(200).json({
        message: "환영합니다. 뭅플 벡엔드 서버입니다.",
    })
})

app.post('/api/user/signup', async (req, res) => {
    try {
        const exUser = await db.collection('user').findOne({
            email: req.body.email
        })
        if (exUser) {
            return res.status(403).send('이미 사용중인 아이디입니다.');
        }
        const hashedPassword = await bcrypt.hash(req.body.password, 12);
        await db.collection('user').insertOne({
            nickName: req.body.nickName,
            email: req.body.email,
            password: hashedPassword,
        })
        res.status(200).send('회원가입에 성공했습니다.');
    } catch (error) {
        console.error(error)
    }
})

app.post('/api/user/login', (req, res, next) => {
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

            return res.status(200).json({
                _id: user._id,
                nickName: user.nickName,
                email: user.email,
                profile: user.profile
            })
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
            return done(null, false, { reason: '존재하지 않는 이메일 입니다.' })
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

app.post('/api/user/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.send("로그아웃 됐습니다.");
        });
    });
})

app.get('/api/user', async (req, res, next) => {
    try {
        if (!req.user) {
            res.status(200).json(null)
        }
        else if (req.user) {
            console.log(req.user)
            const user = await db.collection('user').findOne({
                email: req.user.email
            })
            res.status(200).json({
                _id: user._id,
                nickName: user.nickName,
                email: user.email,
                profile: user.profile
            })
        }
    } catch (error) {
        console.error(error)
    }
})

app.get('/api/plan', async (req, res) => {
    try {
        if (req.user) {
            const plans = await db.collection('post').find({ id: req.user.email }).toArray()
            if (plans) {
                res.status(200).json(plans)
            } else {
                res.status(200).send({ message: '게시물이 없습니다.' });
            }
        } else {
            res.status(200).json(null)
        }
    } catch (error) {
        console.error(error)
    }
})

// 유저 닉네임 변경
app.patch('/api/user', async (req, res) => {
    try {
        await db.collection('user').updateOne(
            { email: req.user.email },
            { $set: { nickName: req.body.nickName, profile: req.body.profile } }
        )
        const User = await db.collection('user').findOne(
            { email: req.user.email }
        )
        console.log(User)
        res.status(200).json(User)
    } catch (error) {
        console.error(error)
    }
})

// 계획 등록
app.post('/api/plan', async (req, res) => {
    try {
        const plan = await db.collection('post').insertOne({
            id: req.body.id,
            reigon: req.body.region,
            date: req.body.date,
            checkList: req.body.checkList,
            todos: req.body.todos,
            cityImg: req.body.cityImg,
        })
        res.status(200).json(plan.ops[0]);
    } catch (error) {
        console.error(error)
    }
})

// 계획 삭제
app.delete('/api/plan/:id', async (req, res) => {
    try {
        await db.collection('post').deleteOne(
            { _id: ObjectId(req.params.id) }
        )
        res.status(200).send({ message: '삭제완료.' });
    } catch (error) {
        console.error(error)
    }
})

// 할일 일정 추가 (날짜)
app.patch('/api/plan/:id/todos', async (req, res) => {
    try {
        const uuid = () => {
            const tokens = v4().split('-')
            return tokens[2] + tokens[1] + tokens[0] + tokens[3] + tokens[4];
        }
        await db.collection('post').updateOne(
            { _id: ObjectId(req.params.id) },
            { $push: { todos: { date: req.body.date, _id: uuid(), todo: req.body.todo } } }
        )
        const findUpdateTodos = await db.collection('post').findOne(
            { _id: ObjectId(req.params.id) }
        )
        console.log(findUpdateTodos)
        res.status(200).json(findUpdateTodos)
    } catch (error) {
        console.error(error)
    }
})

// 할일 일정 삭제 (날짜)
app.delete('/api/plan/:id/todos/:todosId', async (req, res) => {
    try {
        await db.collection('post').updateOne(
            { _id: ObjectId(req.params.id) },
            { $pull: { todos: { _id: req.params.todosId } } }
        )
        res.json({
            _id: req.params.id,
            todosId: req.params.todosId,
        })
    } catch (error) {
        console.error(error)
    }
})


// 할일 등록
app.patch('/api/plan/:id/todos/:todosId/todo', async (req, res) => {
    try {
        const uuid = () => {
            const tokens = v4().split('-')
            return tokens[2] + tokens[1] + tokens[0] + tokens[3] + tokens[4];
        }

        await db.collection('post').updateOne(
            { _id: ObjectId(req.params.id), "todos._id": req.params.todosId },
            {
                $push: {
                    "todos.$.todo":
                    {
                        _id: uuid(),
                        title: req.body.title,
                        body: req.body.body,
                        category: req.body.category,
                        color: req.body.color,
                    }
                }
            }
        );
        const findTodos = await db.collection('post').findOne(
            { _id: ObjectId(req.params.id) }
        )
        res.send(findTodos)
    } catch (error) {
        console.error(error)
    }
})

// 할일 삭제
app.delete('/api/plan/:id/todos/:todosId/todo/:todoId', async (req, res) => {
    try {
        await db.collection('post').updateOne(
            { _id: ObjectId(req.params.id), "todos._id": req.params.todosId },
            { $pull: { "todos.$.todo": { _id: req.params.todoId } } }
        )
        res.json({
            _id: req.params.id,
            todosId: req.params.todosId,
            todoId: req.params.todoId,
        })
    } catch (error) {
        console.error(error)
    }
})

app.patch('/api/plan/:id/checklist', async (req, res) => {
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

app.get('*', function (req, res) {
    res.sendFile(path.join(__dirname, 'moobpl/build/index.html'));
});