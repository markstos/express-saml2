var express = require('express');
var router = express.Router();
var fs = require('fs');
var utility = require('../../../index').Utility;
var spSet = [];
var epn = {
    'admin@idp.com' : {
        assoHash: '$2a$10$/0lqAmz.r6trTurxW3qMJuFHyicUWsV3GKF94KcgN42eVR8y5c25S',
        app: {
            '369550': {
                assoSpEmail: 'admin@sp1.com'
            },
            '369551': {
                assoSpEmail: 'admin@sp2.com'
            }
        }
    }
};

/// Declare that entity, and load all settings when server is started
/// Restart server is needed when new metadata is imported
var idp1 = require('../../../index').IdentityProvider({
    privateKeyFile: '../key/idp/privkey.pem',
    privateKeyFilePass: 'q9ALNhGT5EhfcRmp8Pg7e9zTQeP2x1bW'
},'../metadata/metadata_idp1.xml');
var idp2 = require('../../../index').IdentityProvider({
    privateKeyFile: '../key/idp/privkey.pem',
    privateKeyFilePass: 'q9ALNhGT5EhfcRmp8Pg7e9zTQeP2x1bW'
},'../metadata/metadata_idp2.xml');

/// Declare the sp
var sp1 = require('../../../index').ServiceProvider('../metadata/metadata_sp1.xml');
var sp2 = require('../../../index').ServiceProvider('../metadata/metadata_sp2.xml');

/// metadata is publicly released, can access at /sso/metadata
router.get('/metadata/:id',function(req, res, next){
    var entity = entityPair(req.params.id);
    var assoIdp = entity.assoIdp;
    res.header('Content-Type','text/xml').send(assoIdp.getMetadata());
});

spSet.push(sp1);
spSet.push(sp2);

function entityPair(id){
    var targetSP, assoIdp;
    switch(id.toString()){
        case '369550':
            targetSP = sp1;
            assoIdp = idp1;
            break;
        case '369551':
            targetSP = sp2;
            assoIdp = idp2;
            break;
        default:
            break;
    }
    return {
        targetSP: targetSP,
        assoIdp: assoIdp
    };
}

router.all('/:action/:id',function(req,res,next){
    if(!req.isAuthenticated()){
        var url = '/login';
        if(req.params && req.params.action == 'SingleSignOnService'){
            if(req.method.toLowerCase() == 'post'){
                url = '/login/external.esaml?METHOD=post&TARGET='+ utility.base64Encode(JSON.stringify({
                    entityEndpoint: req.originalUrl,
                    actionType: 'SAMLRequest',
                    actionValue: req.body.SAMLRequest,
                    relayState: req.body.relayState
                }));
            }else if(req.method.toLowerCase() == 'get'){
                url = '/login/external.esaml?METHOD=get&TARGET='+utility.base64Encode(req.originalUrl);
            }
        } else if(req.params && req.params.action == 'SingleLogoutService'){
            if(req.method.toLowerCase() == 'post'){
                url = '/logout/external.esaml?METHOD=post&TARGET='+ utility.base64Encode(JSON.stringify({
                    entityEndpoint: req.originalUrl,
                    actionType: 'LogoutRequest',
                    actionValue: req.body.LogoutRequest,
                    relayState: req.body.relayState
                }));
            }else if(req.method.toLowerCase() == 'get'){
                url = '/logout/external.esaml?METHOD=get&TARGET='+utility.base64Encode(req.originalUrl);
            }
        } else {
            // Unexpected error
            console.warn('Unexpected error');
        }
        return res.redirect(url);
    }
    next();
});

router.get('/SingleSignOnService/:id',function(req,res){
    var entity = entityPair(req.params.id);
    var assoIdp = entity.assoIdp;
    var targetSP = entity.targetSP;
    assoIdp.parseLoginRequest(targetSP,'redirect',req,function(parseResult){
        req.user.email = epn[req.user.sysEmail].app[req.params.id.toString()].assoSpEmail;
        assoIdp.sendLoginResponse(targetSP,parseResult,'post',req.user,function(response){
            res.render('actions',response);
        });
    });
});

router.post('/SingleSignOnService/:id',function(req,res){
    var entity = entityPair(req.params.id);
    var assoIdp = entity.assoIdp;
    var targetSP = entity.targetSP;
    assoIdp.parseLoginRequest(targetSP,'post',req,function(parseResult){
        req.user.email = epn[req.user.sysEmail].app[req.params.id.toString()].assoSpEmail;
        assoIdp.sendLoginResponse(targetSP,parseResult,'post',req.user,function(response){
            res.render('actions',response);
        });
    });
});

router.get('/SingleLogoutService/:id',function(req,res){
    var entity = entityPair(req.params.id);
    var assoIdp = entity.assoIdp;
    var targetSP = entity.targetSP;
    assoIdp.parseLogoutResponse(targetSP,'redirect',req,function(parseResult){
        if(req.query.RelayState){
            res.redirect(req.query.RelayState);
        } else {
            req.logout();
            req.flash('info','All participating service provider has been logged out');
            res.redirect('/login');
        }
    });
});

router.post('/SingleLogoutService/:id',function(req,res){
    var entity = entityPair(req.params.id);
    var assoIdp = entity.assoIdp;
    var targetSP = entity.targetSP;
    assoIdp.parseLogoutResponse(targetSP,'post',req,function(parseResult){
        if(req.body.RelayState){
            res.redirect(req.body.RelayState);
        } else {
            req.logout();
            req.flash('info','All participating service provider has been logged out');
            res.redirect('/login');
        }
    });
});

router.get('/logout/all',function(req,res){
    var serviceList = Object.keys(epn[req.user.sysEmail].app);
    var relayState = 'http://localhost:3001/sso/logout/all';
    if(req.session.relayStep !== undefined) {
        req.session.relayStep = parseInt(req.session.relayStep) + 1;
    } else {
        req.session.relayStep = 0;
    }
    if(req.session.relayStep <= serviceList.length){
        if(req.session.relayStep == serviceList.length){
            relayState = '';
        }
        var id = serviceList[req.session.relayStep];
        var entity = entityPair(id);
        var assoIdp = entity.assoIdp;
        var targetSP = entity.targetSP;
        req.user.email = epn[req.user.sysEmail].app[id.toString()].assoSpEmail;
        assoIdp.sendLogoutRequest(targetSP,'post',req.user, relayState,function(response){
            if(req.query && req.query.async && req.query.async.toString() === 'true'){
                response.ajaxSubmit = true;
            }
            res.render('actions',response);
        });
    } else {
        req.logout();
        req.flash('info','Unexpected error in /relayState');
        res.redirect('/login');
    }
});

router.get('/select/:id',function(req,res){
    var entity = entityPair(req.params.id);
    var assoIdp = entity.assoIdp;
    var targetSP = entity.targetSP;
    req.user.email = epn[req.user.sysEmail].app[req.params.id.toString()].assoSpEmail;
    assoIdp.sendLoginResponse(targetSP,null,'post',req.user,function(response){
        response.title = 'POST data';
        res.render('actions',response);
    });
});

module.exports = router;
