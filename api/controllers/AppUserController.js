/**
 * AppUserController
 *
 * @description :: Server-side logic for managing Appusers
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */
var auth = require('../lib/auth');
var request = require('request');
var parseString = require('xml2js').parseString;
var moment = require('moment');

module.exports = {
	register: function(req, res){
        var phone = req.param('phone');
        var password = req.param('password');
        var username = req.param('username');
        var sex = req.param("sex");
        var errObj = {}, phoneErr = null, passwordErr = null, usernameErr = null, sexErr = null;
        if(!phone||!password||!username||!sex){
            res.status(400);
            res.json({message: "参数不足"});
            return;
        }
        var phoneReg = /^\d{11}$/; 
        if(phone.length != 11 || !phone.match(phoneReg)){
            phoneErr = "电话号码需为11位数字";
        }
        if(password.length < 8){
            passwordErr = "密码长度至少8位";
        }
        if(username.length < 2){
            usernameErr = "用户名长度至少2位";
        }
        if(sex!="1"&&sex!="2"&&sex!="0"){
            sexErr = "性别格式错误";
        }
        if(phoneErr){
            errObj.phone = phoneErr;
        }
        if(passwordErr){
            errObj.password = passwordErr;
        }
        if(usernameErr){
            errObj.username = usernameErr;
        }
        if(sexErr){
            errObj.sex = sexErr;
        }
        if(phoneErr || passwordErr || usernameErr || sexErr){
            res.status(400);
            res.json({message: "Validation error", errMessage: errObj});
            return;
        }
        AppUser.findOne({phone: phone}).exec(function(err, appUserFound){
            if(err){
                res.status(500);
                res.json({message: "Not registered"});
                return;
            }
            if(appUserFound){
                res.status(400);
                res.json({message: "User already found"});
                return;
            }
            AppUser.create({phone: phone, password: password, username: username, phoneVerified: false, authType: "local", sex: sex}).exec(function(err, createdUser){
                if(err){
                    res.status(500);
                    res.json({message: "Not registered"});
                    return;
                }
                res.status(200);
                res.json({message: "Registered"});
        });
        });
        
    },
    logout: function(req, res){
        var sessionId = req.param('session');
        sessions.destroy({id: sessionId}).exec(function(err){
            req.session.destroy();
            res.status(200);
            res.json({message: "Logout"});
        });;
    }
    ,
    phoneRegister: function (req,res) {
        var sessionId = req.param('session');
        if(!sessionId){
            sessionId = "-1";
        }
        auth.getUserId(sessionId, function(err, appUserId){
            if(err){
                res.status(500);
                res.end();
                return;
            }
            if(!appUserId){
                res.status(401);
                res.end();
                return;
            }
            AppUser.findOne({id: appUserId}).exec(function (err, appUserFound) {
                if(err){
                    res.status(500);
                    res.json({message: "Not registered"});
                    return;
                }
                if(!appUserFound)
                {
                    res.status(400);
                    res.end();
                    return;
                }
                if (appUserFound.phoneVerified == true) {
                    res.status(204);
                    res.json({message: 'User is verified'});
                    return;
                }
                var number = Math.floor(Math.random()*(999999-100000+1)+100000);
                appUserFound.verifyCode = number.toString();
                var expire = moment().utcOffset("+08:00").add(1,'d');
                var verificationExpiredAt = moment().add(1, "day").toDate();
                appUserFound.verifyExpire = expire.format("YYYY-MM-DD HH:mm:ssZZ")
                appUserFound.verificationExpiredAt = verificationExpiredAt;
                appUserFound.save(function (err, appUser) {
                    if (err) {
                        res.status(500);
                        res.end();
                        return;
                    };
                    request.post('http://106.ihuyi.cn/webservice/sms.php?method=Submit'
                        , {form:{'account':'cf_borui',
                                'password':'xiaoxin',
                                'mobile':appUser.phone,
                                'content': '您的验证码是：'+appUserFound.verifyCode+'。请不要把验证码泄露给其他人。'}}
                        , function (err, response, result) {
                        if (err) {
                            res.status(500);
                            res.json({message: 'Cant send SMS'});
                            return;
                        };
                        parseString(result, function (err, object) {
                            if (err) {
                                res.status(500);
                                res.json({message: 'Cant receive SMS'});
                                return;
                            };
                            if (object.SubmitResult.code[0] != "2") {
                                res.status(500);
                                res.json({message: object.SubmitResult.msg});
                                return;
                            };
                            res.status(200);
                            res.json({message: 'Verification code send'});
                            return;
                        });
                        
                    });
                    
                });
                
            });
        });
    }
    ,phoneVerify: function (req, res) {
        var sessionId = req.param('session');
        var code = req.param('code');
        
        if(!sessionId||!code){
            res.status(400);
            res.json({message: "参数不足"});
            return;
        }
        auth.getUserId(sessionId, function(err, appUserId){
            if(!appUserId){
                res.status(401);
                res.json({message: "Not authenticated"});
                return;
            }
            AppUser.findOne({id: appUserId}).exec(function (err, appUser) {
                if(err)
                {
                    res.status(500);
                    res.end();
                    return;
                }
                if(!appUser)
                {
                    res.status(401);
                    res.end();
                    return;
                }
                if (appUser.phoneVerified == true) {
                    res.status(204);
                    res.json({message: 'User is verified'});
                    return;
                }
                var today = moment();
                var expiredAt = moment(appUser.verificationExpiredAt);
                
                if (!expiredAt.isValid() || today.isAfter(expiredAt)) {
                    res.status(400);
                    res.json({message: 'Please register first'});
                    return;
                }
                if (appUser.verifyCode == code) {
                    appUser.phoneVerified = true;
                    appUser.verifyCode = null;
                    appUser.verificationExpiredAt = null;
                    appUser.save(function (err, appUserFound) {
                        if (err) {
                            res.status(500);
                            res.json({message: 'Service down'});
                            return;
                        };
                        res.status(200);
                        res.json({message: 'Verification successful'});

                    });
                }
                else {
                    res.status(400);
                    res.json({message: 'Invalid code'});
                    return;
                }
            });
        });
    }
    ,changePassword: function (req, res) {
        var sessionId = req.param('session');
        var password = req.param('password');
        var newPassword = req.param('newPassword');

        if(!sessionId||!password||!newPassword){
            res.status(400);
            res.json({message: "参数不足"});
            return;
        }
        auth.getUserId(sessionId, function(err, appUserId){
            if(!appUserId){
                res.status(401);
                res.json({message: "Not authenticated"});
                return;
            }
            AppUser.findOne({id: appUserId}).exec(function (err, appUser) {
                if(err)
                {
                    res.status(401);
                    res.end();
                    return;
                }
                if(!appUser){
                    res.status(401);
                    res.json({message: "Not authenticated"});
                    return;
                }
                if (appUser.password == password) {
                    if(newPassword.length < 8){
                        res.status(400);
                        res.json({message: "密码长度至少8位"});
                        return;
                    }
                    appUser.password = newPassword;
                    appUser.save(function (err, appUser) {
                        if (err) {
                            res.status(500);
                            res.json({message: 'Service down'});
                            return;
                        }
                        res.status(200);
                        res.json({message: 'change password success'});
                    });
                }
                else {
                    res.status(400);
                    res.json({message: 'invalid password'});
                }
            });
        });

    }
    ,resetPassword: function (req, res) {
        var phone = req.param('phone');

        if(phone==null){
            res.status(400);
            res.json({message: "参数不足"});
            return;
        }
        AppUser.findOne({phone: phone}).exec(function (err, appUser) {
            if(err){
                res.status(500);
                return;
            }
            if(appUser==null)
            {
                res.status(400);
                res.json({message: 'User not found'});
                return;
            }
            var number = Math.floor(Math.random()*(999999-100000+1)+100000);
                appUser.resetVerifyCode = number.toString();
                var expire = moment().utcOffset("+08:00").add(1,'d');
                appUser.resetVerifyExpire = expire.format("YYYY-MM-DD HH:mm:ssZZ")
                appUser.save(function (err, appUser) {
                    if (err) {
                        res.status(500);
                        res.end();
                        return;
                    };
                    request.post('http://106.ihuyi.cn/webservice/sms.php?method=Submit'
                        , {form:{'account':'cf_borui',
                                'password':'xiaoxin',
                                'mobile':appUser.phone,
                                'content': '您的验证码是：'+appUser.resetVerifyCode+'。请不要把验证码泄露给其他人。'}}
                        , function (err, response, result) {
                        if (err) {
                            res.status(500);
                            res.json({message: 'Cant send SMS'});
                            return;
                        };
                        parseString(result, function (err, object) {
                            if (err) {
                                res.status(500);
                                res.json({message: 'Cant receive SMS'});
                                return;
                            };
                            if (object.SubmitResult.code[0] != "2") {
                                res.status(500);
                                res.json({message: object.SubmitResult.msg});
                                return;
                            };
                            res.status(200);
                            res.json({message: 'regist success'});
                        });
                        
                    });
                    
                });

        });
    }
    ,
    resetVerify: function (req, res) {
        var phone = req.param('phone');
        var newPassword = req.param('newpassword');
        var code = req.param('code');
        
        if(phone==null||code==null||newPassword==null){
            res.status(400);
            res.json({message: "参数不足"});
            return;
        }
            AppUser.findOne({phone: phone}).exec(function (err, appUser) {
                if(err)
                {
                    res.status(500);
                    res.end();
                    return;
                }
                if(appUser==null)
                {
                    console.log("appUser not found");
                    res.status(400);
                    res.end();
                    return;
                }
                var today = moment();
                var expire = moment(appUser.resetVerifyExpire, "YYYY-MM-DD HH:mm:ssZZ");
                if (!expire.isValid() || today.isAfter(expire)) {
                    res.status(400);
                    res.json({message: 'please regist first'});
                    return;
                }
                if (appUser.resetVerifyCode == code) {
                    appUser.password = newPassword;
                    appUser.resetVerifyCode = null;
                    appUser.resetVerifyExpire = null;
                    appUser.save(function (err, appUser) {
                        if (err) {
                            console.log('service down');
                            res.status(500);
                            res.json({message: 'service down'});
                            return;
                        };
                        res.status(200);
                        res.json({message: 'verify success'});
                    });
                }
                else {
                    res.status(400);
                    res.json({message: 'wrong code'});
                    return;
                }
            });
        
    }
    
};

