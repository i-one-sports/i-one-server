/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./libs/common/src/decorators/currentUser.decorator.ts":
/*!*************************************************************!*\
  !*** ./libs/common/src/decorators/currentUser.decorator.ts ***!
  \*************************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CurrentUser = void 0;
exports.getCurrentUserByContext = getCurrentUserByContext;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
function getCurrentUserByContext(context) {
    if (context.getType() === 'http') {
        return context.switchToHttp().getRequest().user;
    }
    if (context.getType() === 'rpc') {
        return context.switchToRpc().getData().user;
    }
}
exports.CurrentUser = (0, common_1.createParamDecorator)((_data, context) => getCurrentUserByContext(context));


/***/ }),

/***/ "./libs/common/src/decorators/isOwner.decorator.ts":
/*!*********************************************************!*\
  !*** ./libs/common/src/decorators/isOwner.decorator.ts ***!
  \*********************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.IsOwner = void 0;
exports.getOwnerByContext = getOwnerByContext;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
function getOwnerByContext(context) {
    if (context.getType() === 'http') {
        return context.switchToHttp().getRequest()?.user;
    }
    return context.switchToRpc().getData()?.user;
}
exports.IsOwner = (0, common_1.createParamDecorator)((ctx) => {
    const user = getOwnerByContext(ctx);
    if (user?.isOwner === true) {
        return user;
    }
    if (user === undefined || !user?.isOwner) {
        throw new common_1.ForbiddenException('You do not have the required clearance to access this resource');
    }
    return user;
});


/***/ }),

/***/ "./libs/common/src/filters/http-exception.filter copy.ts":
/*!***************************************************************!*\
  !*** ./libs/common/src/filters/http-exception.filter copy.ts ***!
  \***************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GlobalExceptionFilter = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const core_1 = __webpack_require__(/*! @nestjs/core */ "@nestjs/core");
let GlobalExceptionFilter = class GlobalExceptionFilter {
    constructor(httpAdapterHost) {
        this.httpAdapterHost = httpAdapterHost;
    }
    catch(exception, host) {
        const { httpAdapter } = this.httpAdapterHost;
        const ctx = host.switchToHttp();
        let statusCode = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        if (exception instanceof common_1.HttpException) {
            const response = exception.getResponse();
            statusCode = exception.getStatus();
            message = response.message || response;
        }
        const responseBody = {
            statusCode,
            timestamp: new Date().toISOString(),
            path: httpAdapter.getRequestUrl(ctx.getRequest()),
            message: Array.isArray(message) ? message[0] : message,
        };
        httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [typeof (_a = typeof core_1.HttpAdapterHost !== "undefined" && core_1.HttpAdapterHost) === "function" ? _a : Object])
], GlobalExceptionFilter);


/***/ }),

/***/ "./libs/common/src/filters/http-exception.filter.ts":
/*!**********************************************************!*\
  !*** ./libs/common/src/filters/http-exception.filter.ts ***!
  \**********************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CustomHttpException = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
class CustomHttpException extends common_1.HttpException {
    constructor(message, statusCode) {
        super({
            statusCode,
            message,
            timestamp: new Date().toISOString(),
        }, statusCode);
    }
}
exports.CustomHttpException = CustomHttpException;


/***/ }),

/***/ "./libs/common/src/index.ts":
/*!**********************************!*\
  !*** ./libs/common/src/index.ts ***!
  \**********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(/*! ./types/common */ "./libs/common/src/types/common.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/abstract.repository */ "./libs/common/src/schemas/abstract.repository.ts"), exports);
__exportStar(__webpack_require__(/*! ./filters/http-exception.filter */ "./libs/common/src/filters/http-exception.filter.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/user.schema */ "./libs/common/src/schemas/user.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/sets.schema */ "./libs/common/src/schemas/sets.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/session.schema */ "./libs/common/src/schemas/session.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/match.schema */ "./libs/common/src/schemas/match.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/location.schema */ "./libs/common/src/schemas/location.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./utils/phone.number */ "./libs/common/src/utils/phone.number.ts"), exports);
__exportStar(__webpack_require__(/*! ./typings/global.interface */ "./libs/common/src/typings/global.interface.ts"), exports);
__exportStar(__webpack_require__(/*! ./decorators/currentUser.decorator */ "./libs/common/src/decorators/currentUser.decorator.ts"), exports);
__exportStar(__webpack_require__(/*! ./decorators/isOwner.decorator */ "./libs/common/src/decorators/isOwner.decorator.ts"), exports);
__exportStar(__webpack_require__(/*! ./filters/http-exception.filter copy */ "./libs/common/src/filters/http-exception.filter copy.ts"), exports);
__exportStar(__webpack_require__(/*! ./utils/nodemailer */ "./libs/common/src/utils/nodemailer.ts"), exports);
__exportStar(__webpack_require__(/*! ./utils/phone.number */ "./libs/common/src/utils/phone.number.ts"), exports);


/***/ }),

/***/ "./libs/common/src/schemas/abstract.repository.ts":
/*!********************************************************!*\
  !*** ./libs/common/src/schemas/abstract.repository.ts ***!
  \********************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AbstractRepository = void 0;
const mongoose_1 = __webpack_require__(/*! mongoose */ "mongoose");
class AbstractRepository {
    constructor(model, connection) {
        this.model = model;
        this.connection = connection;
    }
    async create(document, options) {
        const createdDocument = new this.model({
            ...document,
            _id: new mongoose_1.Types.ObjectId(),
        });
        return await createdDocument.save(options);
    }
    async findOneAndPopulate(filterQuery, populatePaths) {
        const paths = populatePaths.map((path) => ({
            path,
            options: {
                sort: {
                    createdAt: 'desc',
                },
            },
        }));
        return (await this.model
            .findOne(filterQuery, {}, { lean: true })
            .populate(paths));
    }
    async findOne(filterQuery) {
        return await this.model.findOne(filterQuery, {}, { lean: true });
    }
    async findAndPopulate(filterQuery, populatePaths) {
        const paths = populatePaths.map((path) => ({
            path,
            options: {
                sort: {
                    createdAt: 'desc',
                },
            },
        }));
        return (await this.model
            .find(filterQuery)
            .sort({ createdAt: 'desc' })
            .populate(paths));
    }
    findRaw() {
        return this.model;
    }
    async findOneAndUpdate(filterQuery, update) {
        const document = await this.model.findOneAndUpdate(filterQuery, update, {
            lean: true,
            new: true,
        });
        if (document === null) {
            this.logger.warn('Document not found with filterQuery:', filterQuery);
        }
        return document;
    }
    async upsert(filterQuery, document) {
        return await new Promise((resolve) => resolve(this.model.findOneAndUpdate(filterQuery, document, {
            lean: true,
            upsert: true,
            new: true,
        })));
    }
    async deleteMany(filterQuery) {
        return await new Promise((resolve) => resolve(this.model.deleteMany(filterQuery)));
    }
    async insertMany(documents, options) {
        return await this.model.insertMany(documents, options);
    }
    async find(filterQuery) {
        return await new Promise((resolve) => resolve(this.model
            .find(filterQuery, {}, { lean: true })
            .sort({ createdAt: 'desc' })));
    }
    async update(filterQuery, update) {
        return await new Promise((resolve) => resolve(this.model.updateOne(filterQuery, update)));
    }
    async updateMany(filterQuery, update) {
        console.log("Model name:", this.model.modelName);
        return this.model.updateMany(filterQuery, update);
    }
    async findAndUpdate(filterQuery, update) {
        return await new Promise((resolve) => {
            resolve(this.model.updateMany(filterQuery, update).sort({ createdAt: 'desc' }));
        });
    }
    async delete(id) {
        return await new Promise((resolve) => resolve(this.model.findByIdAndDelete(id)));
    }
    async startTransaction() {
        if (this.connection !== undefined) {
            const session = await this.connection.startSession();
            session.startTransaction();
            return session;
        }
    }
}
exports.AbstractRepository = AbstractRepository;


/***/ }),

/***/ "./libs/common/src/schemas/abstract.schema.ts":
/*!****************************************************!*\
  !*** ./libs/common/src/schemas/abstract.schema.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AbstractDocument = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let AbstractDocument = class AbstractDocument {
};
exports.AbstractDocument = AbstractDocument;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.SchemaTypes.ObjectId }),
    __metadata("design:type", typeof (_a = typeof mongoose_2.Types !== "undefined" && mongoose_2.Types.ObjectId) === "function" ? _a : Object)
], AbstractDocument.prototype, "_id", void 0);
exports.AbstractDocument = AbstractDocument = __decorate([
    (0, mongoose_1.Schema)()
], AbstractDocument);


/***/ }),

/***/ "./libs/common/src/schemas/location.schema.ts":
/*!****************************************************!*\
  !*** ./libs/common/src/schemas/location.schema.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LocationSchema = exports.Location = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
const common_1 = __webpack_require__(/*! ../types/common */ "./libs/common/src/types/common.ts");
let Location = class Location extends abstract_schema_1.AbstractDocument {
};
exports.Location = Location;
__decorate([
    (0, mongoose_1.Prop)({ required: true, type: String }),
    __metadata("design:type", String)
], Location.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, type: String }),
    __metadata("design:type", String)
], Location.prototype, "address", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: {
            type: String,
            default: 'Point',
        },
        coordinates: {
            type: [Number],
            default: [0, 0],
        },
    }),
    __metadata("design:type", typeof (_a = typeof common_1.LocationCoordinates !== "undefined" && common_1.LocationCoordinates) === "function" ? _a : Object)
], Location.prototype, "location", void 0);
exports.Location = Location = __decorate([
    (0, mongoose_1.Schema)()
], Location);
exports.LocationSchema = mongoose_1.SchemaFactory.createForClass(Location);
exports.LocationSchema.index({ location: '2dsphere' });


/***/ }),

/***/ "./libs/common/src/schemas/match.schema.ts":
/*!*************************************************!*\
  !*** ./libs/common/src/schemas/match.schema.ts ***!
  \*************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MatchSchema = exports.Match = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
let Match = class Match extends abstract_schema_1.AbstractDocument {
};
exports.Match = Match;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Set' }),
    __metadata("design:type", String)
], Match.prototype, "teamOne", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Set' }),
    __metadata("design:type", String)
], Match.prototype, "teamTwo", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], Match.prototype, "teamOneScore", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], Match.prototype, "teamTwoScore", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], Match.prototype, "isStarted", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Session' }),
    __metadata("design:type", String)
], Match.prototype, "session", void 0);
exports.Match = Match = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Match);
exports.MatchSchema = mongoose_1.SchemaFactory.createForClass(Match);


/***/ }),

/***/ "./libs/common/src/schemas/session.schema.ts":
/*!***************************************************!*\
  !*** ./libs/common/src/schemas/session.schema.ts ***!
  \***************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SessionSchema = exports.Session = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
const constants_1 = __webpack_require__(/*! src/config/constants */ "./src/config/constants.ts");
class Session extends abstract_schema_1.AbstractDocument {
}
exports.Session = Session;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Location' }),
    __metadata("design:type", String)
], Session.prototype, "location", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Session.prototype, "playersPerTeam", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Session.prototype, "setNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Session.prototype, "minsPerSet", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Session.prototype, "timeDuration", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], Session.prototype, "startTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], Session.prototype, "stopTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Session.prototype, "winningDecider", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Session.prototype, "inProgress", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Session.prototype, "finished", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", String)
], Session.prototype, "captain", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ type: mongoose_2.Types.ObjectId, ref: 'User' }] }),
    __metadata("design:type", Array)
], Session.prototype, "members", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Session.prototype, "maxNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Session.prototype, "isFull", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: constants_1.MATCH_TYPE, default: constants_1.MATCH_TYPE.FRIENDLY }),
    __metadata("design:type", String)
], Session.prototype, "matchType", void 0);
exports.SessionSchema = mongoose_1.SchemaFactory.createForClass(Session);


/***/ }),

/***/ "./libs/common/src/schemas/sets.schema.ts":
/*!************************************************!*\
  !*** ./libs/common/src/schemas/sets.schema.ts ***!
  \************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SetSchema = exports.Set = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
class Set extends abstract_schema_1.AbstractDocument {
}
exports.Set = Set;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Session' }),
    __metadata("design:type", String)
], Set.prototype, "session", void 0);
__decorate([
    (0, mongoose_1.Prop)(String),
    __metadata("design:type", String)
], Set.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", Array)
], Set.prototype, "players", void 0);
exports.SetSchema = mongoose_1.SchemaFactory.createForClass(Set);


/***/ }),

/***/ "./libs/common/src/schemas/user.schema.ts":
/*!************************************************!*\
  !*** ./libs/common/src/schemas/user.schema.ts ***!
  \************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserSchema = exports.User = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
const common_1 = __webpack_require__(/*! ../types/common */ "./libs/common/src/types/common.ts");
let User = class User extends abstract_schema_1.AbstractDocument {
};
exports.User = User;
__decorate([
    (0, mongoose_1.Prop)(String),
    __metadata("design:type", String)
], User.prototype, "firstName", void 0);
__decorate([
    (0, mongoose_1.Prop)(String),
    __metadata("design:type", String)
], User.prototype, "lastName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, unique: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, mongoose_1.Prop)(String),
    __metadata("design:type", String)
], User.prototype, "nickname", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "password", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "address", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "phoneNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], User.prototype, "position", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "isCaptain", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "isOwner", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Session', default: null }),
    __metadata("design:type", String)
], User.prototype, "currentSession", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: null }),
    __metadata("design:type", Number)
], User.prototype, "otp", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: null }),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], User.prototype, "otpExpiration", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Boolean, default: null }),
    __metadata("design:type", Boolean)
], User.prototype, "otpVerified", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: {
            type: String,
            default: 'Point',
        },
        coordinates: {
            type: [Number],
            default: [0, 0],
        },
    }),
    __metadata("design:type", typeof (_b = typeof common_1.LocationCoordinates !== "undefined" && common_1.LocationCoordinates) === "function" ? _b : Object)
], User.prototype, "location", void 0);
exports.User = User = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], User);
exports.UserSchema = mongoose_1.SchemaFactory.createForClass(User);
exports.UserSchema.index({ location: '2dsphere' });


/***/ }),

/***/ "./libs/common/src/types/common.ts":
/*!*****************************************!*\
  !*** ./libs/common/src/types/common.ts ***!
  \*****************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));


/***/ }),

/***/ "./libs/common/src/typings/global.interface.ts":
/*!*****************************************************!*\
  !*** ./libs/common/src/typings/global.interface.ts ***!
  \*****************************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));


/***/ }),

/***/ "./libs/common/src/utils/nodemailer.ts":
/*!*********************************************!*\
  !*** ./libs/common/src/utils/nodemailer.ts ***!
  \*********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MailerService = void 0;
const nodemailer = __webpack_require__(/*! nodemailer */ "nodemailer");
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
let MailerService = class MailerService {
    constructor(configService) {
        this.configService = configService;
        this.transporter = nodemailer.createTransport({
            host: this.configService.get('MAIL_HOST'),
            port: this.configService.get('MAIL_PORT'),
            secure: this.configService.get('MAIL_SECURE'),
            auth: {
                user: this.configService.get('MAIL_USER'),
                pass: this.configService.get('MAIL_PASS'),
            },
        });
    }
    async sendMail(to, subject, text, html) {
        try {
            await this.transporter.sendMail({
                from: this.configService.get('MAIL_FROM'),
                to,
                subject,
                text,
                html,
            });
        }
        catch (error) {
            console.error(`Email failed to send: ${error.message}`);
        }
    }
};
exports.MailerService = MailerService;
exports.MailerService = MailerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], MailerService);


/***/ }),

/***/ "./libs/common/src/utils/phone.number.ts":
/*!***********************************************!*\
  !*** ./libs/common/src/utils/phone.number.ts ***!
  \***********************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.internationalisePhoneNumber = internationalisePhoneNumber;
function internationalisePhoneNumber(num) {
    switch (num.length) {
        case 10:
            return `+234${num}`;
        case 11:
            return `+234${num.slice(1)}`;
        case 13:
            return `+${num}`;
        default:
            return num;
    }
}


/***/ }),

/***/ "./src/app.controller.ts":
/*!*******************************!*\
  !*** ./src/app.controller.ts ***!
  \*******************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const app_service_1 = __webpack_require__(/*! ./app.service */ "./src/app.service.ts");
let AppController = class AppController {
    constructor(appService) {
        this.appService = appService;
    }
    getHello() {
        return this.appService.getHello();
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "getHello", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [typeof (_a = typeof app_service_1.AppService !== "undefined" && app_service_1.AppService) === "function" ? _a : Object])
], AppController);


/***/ }),

/***/ "./src/app.module.ts":
/*!***************************!*\
  !*** ./src/app.module.ts ***!
  \***************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const app_controller_1 = __webpack_require__(/*! ./app.controller */ "./src/app.controller.ts");
const app_service_1 = __webpack_require__(/*! ./app.service */ "./src/app.service.ts");
const users_module_1 = __webpack_require__(/*! ./users/users.module */ "./src/users/users.module.ts");
const database_module_1 = __webpack_require__(/*! ./database/database.module */ "./src/database/database.module.ts");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
const passport_1 = __webpack_require__(/*! @nestjs/passport */ "@nestjs/passport");
const jwt_1 = __webpack_require__(/*! @nestjs/jwt */ "@nestjs/jwt");
const auth_module_1 = __webpack_require__(/*! ./auth/auth.module */ "./src/auth/auth.module.ts");
const sets_module_1 = __webpack_require__(/*! ./sets/sets.module */ "./src/sets/sets.module.ts");
const sessions_module_1 = __webpack_require__(/*! ./sessions/sessions.module */ "./src/sessions/sessions.module.ts");
const matches_module_1 = __webpack_require__(/*! ./matches/matches.module */ "./src/matches/matches.module.ts");
const locations_module_1 = __webpack_require__(/*! ./locations/locations.module */ "./src/locations/locations.module.ts");
const schedule_1 = __webpack_require__(/*! @nestjs/schedule */ "@nestjs/schedule");
let RootCronService = class RootCronService {
    handleCron() {
    }
};
__decorate([
    (0, schedule_1.Cron)('*/30 * * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RootCronService.prototype, "handleCron", null);
RootCronService = __decorate([
    (0, common_1.Injectable)()
], RootCronService);
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
            }),
            passport_1.PassportModule,
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                useFactory: (configService) => ({
                    secret: configService.get('JWT_SECRET'),
                    signOptions: {
                        expiresIn: '1d',
                    },
                }),
                inject: [config_1.ConfigService],
            }),
            database_module_1.DatabaseModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            sessions_module_1.SessionsModule,
            sets_module_1.SetsModule,
            matches_module_1.MatchesModule,
            locations_module_1.LocationsModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService, RootCronService],
    })
], AppModule);


/***/ }),

/***/ "./src/app.service.ts":
/*!****************************!*\
  !*** ./src/app.service.ts ***!
  \****************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
let AppService = class AppService {
    getHello() {
        return 'Hello World!';
    }
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)()
], AppService);


/***/ }),

/***/ "./src/auth/auth.controller.ts":
/*!*************************************!*\
  !*** ./src/auth/auth.controller.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const express_1 = __webpack_require__(/*! express */ "express");
const local_guard_1 = __webpack_require__(/*! ./guards/local.guard */ "./src/auth/guards/local.guard.ts");
const auth_service_1 = __webpack_require__(/*! ./auth.service */ "./src/auth/auth.service.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    async login(user, response) {
        return await this.authService.login(user, response);
    }
    async logout(response) {
        return this.authService.logout(response);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.UseGuards)(local_guard_1.LocalGuard),
    (0, common_1.Post)('user/login'),
    __param(0, (0, common_2.CurrentUser)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _b : Object, typeof (_c = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _c : Object]),
    __metadata("design:returntype", typeof (_d = typeof Promise !== "undefined" && Promise) === "function" ? _d : Object)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('user/logout'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _e : Object]),
    __metadata("design:returntype", typeof (_f = typeof Promise !== "undefined" && Promise) === "function" ? _f : Object)
], AuthController.prototype, "logout", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [typeof (_a = typeof auth_service_1.AuthService !== "undefined" && auth_service_1.AuthService) === "function" ? _a : Object])
], AuthController);


/***/ }),

/***/ "./src/auth/auth.module.ts":
/*!*********************************!*\
  !*** ./src/auth/auth.module.ts ***!
  \*********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const passport_1 = __webpack_require__(/*! @nestjs/passport */ "@nestjs/passport");
const jwt_1 = __webpack_require__(/*! @nestjs/jwt */ "@nestjs/jwt");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
const auth_controller_1 = __webpack_require__(/*! ./auth.controller */ "./src/auth/auth.controller.ts");
const auth_service_1 = __webpack_require__(/*! ./auth.service */ "./src/auth/auth.service.ts");
const local_strategy_1 = __webpack_require__(/*! ./strategy/local.strategy */ "./src/auth/strategy/local.strategy.ts");
const jwt_strategy_1 = __webpack_require__(/*! ./strategy/jwt.strategy */ "./src/auth/strategy/jwt.strategy.ts");
const users_module_1 = __webpack_require__(/*! ../users/users.module */ "./src/users/users.module.ts");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            users_module_1.UsersModule,
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.registerAsync({
                useFactory: (configService) => ({
                    secret: configService.get('JWT_SECRET'),
                    signOptions: { expiresIn: '1d' },
                }),
                inject: [config_1.ConfigService],
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [auth_service_1.AuthService, local_strategy_1.UserLocalStrategy, jwt_strategy_1.UsersJwtStrategy],
        exports: [auth_service_1.AuthService],
    })
], AuthModule);


/***/ }),

/***/ "./src/auth/auth.service.ts":
/*!**********************************!*\
  !*** ./src/auth/auth.service.ts ***!
  \**********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
const jwt_1 = __webpack_require__(/*! @nestjs/jwt */ "@nestjs/jwt");
let AuthService = class AuthService {
    constructor(configService, jwtService) {
        this.configService = configService;
        this.jwtService = jwtService;
    }
    async login(user, response) {
        console.log(user);
        const payload = {
            userId: user._id,
        };
        const expires = new Date(Date.now() + Number(this.configService.get('USER_JWT_EXPIRATION')) * 1000);
        const token = this.jwtService.sign(payload);
        response.cookie('Authentication', token, {
            httpOnly: true,
            expires,
            sameSite: 'none',
            secure: true,
        });
        response.send();
    }
    logout(response) {
        response.cookie('Authentication', '', {
            httpOnly: true,
            expires: new Date(),
        });
        response.send();
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object, typeof (_b = typeof jwt_1.JwtService !== "undefined" && jwt_1.JwtService) === "function" ? _b : Object])
], AuthService);


/***/ }),

/***/ "./src/auth/guards/jwt.guard.ts":
/*!**************************************!*\
  !*** ./src/auth/guards/jwt.guard.ts ***!
  \**************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JwtAuthGuard = void 0;
const passport_1 = __webpack_require__(/*! @nestjs/passport */ "@nestjs/passport");
class JwtAuthGuard extends (0, passport_1.AuthGuard)('jwt') {
}
exports.JwtAuthGuard = JwtAuthGuard;


/***/ }),

/***/ "./src/auth/guards/local.guard.ts":
/*!****************************************!*\
  !*** ./src/auth/guards/local.guard.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LocalGuard = void 0;
const passport_1 = __webpack_require__(/*! @nestjs/passport */ "@nestjs/passport");
class LocalGuard extends (0, passport_1.AuthGuard)('local') {
}
exports.LocalGuard = LocalGuard;


/***/ }),

/***/ "./src/auth/strategy/jwt.strategy.ts":
/*!*******************************************!*\
  !*** ./src/auth/strategy/jwt.strategy.ts ***!
  \*******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersJwtStrategy = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
const passport_1 = __webpack_require__(/*! @nestjs/passport */ "@nestjs/passport");
const passport_jwt_1 = __webpack_require__(/*! passport-jwt */ "passport-jwt");
const users_service_1 = __webpack_require__(/*! ../../users/users.service */ "./src/users/users.service.ts");
let UsersJwtStrategy = class UsersJwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'jwt') {
    constructor(configService, usersService) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromExtractors([
                (request) => {
                    return request?.cookies?.Authentication;
                },
            ]),
            secretOrKey: configService.get('JWT_SECRET'),
        });
        this.usersService = usersService;
    }
    async validate({ userId }) {
        try {
            return await this.usersService.getProfile(userId);
        }
        catch (error) {
            throw new common_1.UnauthorizedException(error.message);
        }
    }
};
exports.UsersJwtStrategy = UsersJwtStrategy;
exports.UsersJwtStrategy = UsersJwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object, typeof (_b = typeof users_service_1.UsersService !== "undefined" && users_service_1.UsersService) === "function" ? _b : Object])
], UsersJwtStrategy);


/***/ }),

/***/ "./src/auth/strategy/local.strategy.ts":
/*!*********************************************!*\
  !*** ./src/auth/strategy/local.strategy.ts ***!
  \*********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserLocalStrategy = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const passport_1 = __webpack_require__(/*! @nestjs/passport */ "@nestjs/passport");
const passport_local_1 = __webpack_require__(/*! passport-local */ "passport-local");
const users_service_1 = __webpack_require__(/*! ../../users/users.service */ "./src/users/users.service.ts");
let UserLocalStrategy = class UserLocalStrategy extends (0, passport_1.PassportStrategy)(passport_local_1.Strategy, 'local') {
    constructor(usersService) {
        super({ usernameField: 'email' });
        this.usersService = usersService;
    }
    async validate(email, password) {
        try {
            return await this.usersService.validateUser(email.toLowerCase(), password);
        }
        catch (error) {
            throw new common_1.UnauthorizedException(error);
        }
    }
};
exports.UserLocalStrategy = UserLocalStrategy;
exports.UserLocalStrategy = UserLocalStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof users_service_1.UsersService !== "undefined" && users_service_1.UsersService) === "function" ? _a : Object])
], UserLocalStrategy);


/***/ }),

/***/ "./src/config/constants.ts":
/*!*********************************!*\
  !*** ./src/config/constants.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MATCH_TYPE = void 0;
var MATCH_TYPE;
(function (MATCH_TYPE) {
    MATCH_TYPE["TOURNAMENT"] = "tournament";
    MATCH_TYPE["LEAGUE"] = "league";
    MATCH_TYPE["FRIENDLY"] = "friendly";
})(MATCH_TYPE || (exports.MATCH_TYPE = MATCH_TYPE = {}));


/***/ }),

/***/ "./src/database/database.module.ts":
/*!*****************************************!*\
  !*** ./src/database/database.module.ts ***!
  \*****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DatabaseModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forRootAsync({
                useFactory: (configService) => ({
                    uri: process.env.NODE_ENV === 'test'
                        ? configService.get('TEST_MONGODB_URI')
                        : configService.get('MONGODB_URI', 'mongodb://root:password123@mongodb-primary:27017/'),
                }),
                inject: [config_1.ConfigService],
            }),
        ],
    })
], DatabaseModule);


/***/ }),

/***/ "./src/locations/dto/location.dto.ts":
/*!*******************************************!*\
  !*** ./src/locations/dto/location.dto.ts ***!
  \*******************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ViewNearbyLocationsDto = exports.CreateLocationDto = void 0;
class CreateLocationDto {
}
exports.CreateLocationDto = CreateLocationDto;
class ViewNearbyLocationsDto {
}
exports.ViewNearbyLocationsDto = ViewNearbyLocationsDto;


/***/ }),

/***/ "./src/locations/locations.controller.ts":
/*!***********************************************!*\
  !*** ./src/locations/locations.controller.ts ***!
  \***********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LocationsController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const jwt_guard_1 = __webpack_require__(/*! src/auth/guards/jwt.guard */ "./src/auth/guards/jwt.guard.ts");
const locations_service_1 = __webpack_require__(/*! ./locations.service */ "./src/locations/locations.service.ts");
const location_dto_1 = __webpack_require__(/*! ./dto/location.dto */ "./src/locations/dto/location.dto.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
let LocationsController = class LocationsController {
    constructor(locationsService) {
        this.locationsService = locationsService;
    }
    async viewAllLocations() {
        return this.locationsService.viewAllLocations();
    }
    async registerLocation(user, data) {
        return this.locationsService.registerLocation(data);
    }
    async getNearbyLocations(data) {
        return this.locationsService.viewNearbyLocations(data);
    }
    async getMyLocation(user) {
        return this.locationsService.getMyLocation(user._id.toString());
    }
};
exports.LocationsController = LocationsController;
__decorate([
    (0, common_1.Get)('all'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "viewAllLocations", null);
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_2.IsOwner)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _b : Object, typeof (_c = typeof location_dto_1.CreateLocationDto !== "undefined" && location_dto_1.CreateLocationDto) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "registerLocation", null);
__decorate([
    (0, common_1.Get)('nearby'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof location_dto_1.ViewNearbyLocationsDto !== "undefined" && location_dto_1.ViewNearbyLocationsDto) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "getNearbyLocations", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_2.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "getMyLocation", null);
exports.LocationsController = LocationsController = __decorate([
    (0, common_1.Controller)('location'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [typeof (_a = typeof locations_service_1.LocationsService !== "undefined" && locations_service_1.LocationsService) === "function" ? _a : Object])
], LocationsController);


/***/ }),

/***/ "./src/locations/locations.module.ts":
/*!*******************************************!*\
  !*** ./src/locations/locations.module.ts ***!
  \*******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LocationsModule = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const locations_controller_1 = __webpack_require__(/*! ./locations.controller */ "./src/locations/locations.controller.ts");
const locations_service_1 = __webpack_require__(/*! ./locations.service */ "./src/locations/locations.service.ts");
const locations_repository_1 = __webpack_require__(/*! ./locations.repository */ "./src/locations/locations.repository.ts");
const users_repository_1 = __webpack_require__(/*! src/users/users.repository */ "./src/users/users.repository.ts");
let LocationsModule = class LocationsModule {
};
exports.LocationsModule = LocationsModule;
exports.LocationsModule = LocationsModule = __decorate([
    (0, common_2.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: common_1.Location.name, schema: common_1.LocationSchema },
                { name: common_1.User.name, schema: common_1.UserSchema },
            ]),
        ],
        controllers: [locations_controller_1.LocationsController],
        providers: [locations_service_1.LocationsService, locations_repository_1.LocationRepository, users_repository_1.UserRepository],
        exports: [locations_service_1.LocationsService],
    })
], LocationsModule);


/***/ }),

/***/ "./src/locations/locations.repository.ts":
/*!***********************************************!*\
  !*** ./src/locations/locations.repository.ts ***!
  \***********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var LocationRepository_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LocationRepository = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let LocationRepository = LocationRepository_1 = class LocationRepository extends common_2.AbstractRepository {
    constructor(LocationModel) {
        super(LocationModel);
        this.logger = new common_1.Logger(LocationRepository_1.name);
    }
};
exports.LocationRepository = LocationRepository;
exports.LocationRepository = LocationRepository = LocationRepository_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(common_2.Location.name)),
    __metadata("design:paramtypes", [typeof (_a = typeof mongoose_2.Model !== "undefined" && mongoose_2.Model) === "function" ? _a : Object])
], LocationRepository);


/***/ }),

/***/ "./src/locations/locations.service.ts":
/*!********************************************!*\
  !*** ./src/locations/locations.service.ts ***!
  \********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LocationsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const locations_repository_1 = __webpack_require__(/*! ./locations.repository */ "./src/locations/locations.repository.ts");
const users_repository_1 = __webpack_require__(/*! ../users/users.repository */ "./src/users/users.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
let LocationsService = class LocationsService {
    constructor(locationRepository, userRepository) {
        this.locationRepository = locationRepository;
        this.userRepository = userRepository;
    }
    async registerLocation(locationData) {
        const { name, address, location } = locationData;
        const alreadyExists = await this.locationRepository.findOne({
            'location.coordinates': {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: location.coordinates,
                    },
                    $maxDistance: 1,
                },
            },
        });
        if (alreadyExists) {
            throw new common_2.CustomHttpException('Location already registered', common_1.HttpStatus.CONFLICT);
        }
        return await this.locationRepository.create({ name, address, location });
    }
    async viewAllLocations() {
        return await this.locationRepository.find({});
    }
    async viewNearbyLocations(locationData) {
        const { longitude, latitude } = locationData;
        return await this.locationRepository.find({
            'location.coordinates': {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)],
                    },
                    $maxDistance: 5000,
                },
            },
        });
    }
    async getMyLocation(userId) {
        const user = await this.userRepository.findOne({ _id: userId });
        if (!user) {
            throw new common_2.CustomHttpException('User not found', common_1.HttpStatus.NOT_FOUND);
        }
        const location = user.locationInfo;
        const address = user.locationInfo.address;
        const coordinates = user.locationInfo.location.coordinates;
        return { locationInfo: location, address, coordinates };
    }
};
exports.LocationsService = LocationsService;
exports.LocationsService = LocationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof locations_repository_1.LocationRepository !== "undefined" && locations_repository_1.LocationRepository) === "function" ? _a : Object, typeof (_b = typeof users_repository_1.UserRepository !== "undefined" && users_repository_1.UserRepository) === "function" ? _b : Object])
], LocationsService);


/***/ }),

/***/ "./src/matches/matches.controller.ts":
/*!*******************************************!*\
  !*** ./src/matches/matches.controller.ts ***!
  \*******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MatchesController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const jwt_guard_1 = __webpack_require__(/*! src/auth/guards/jwt.guard */ "./src/auth/guards/jwt.guard.ts");
const matches_service_1 = __webpack_require__(/*! ./matches.service */ "./src/matches/matches.service.ts");
let MatchesController = class MatchesController {
    constructor(matchesService) {
        this.matchesService = matchesService;
    }
    async matchUp(sessionId) {
        return this.matchesService.matchUp(sessionId);
    }
    async viewSessionMatchUps(sessionId) {
        return this.matchesService.viewSessionMatchUps(sessionId);
    }
    async startMatchInSession(matchId) {
        return this.matchesService.startMatch(matchId);
    }
    async viewMatchDetails(matchId) {
        return this.matchesService.viewMatchDetails(matchId);
    }
    async endMatchInSession(matchId) {
        return this.matchesService.endMatch(matchId);
    }
};
exports.MatchesController = MatchesController;
__decorate([
    (0, common_1.Post)('matchup/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "matchUp", null);
__decorate([
    (0, common_1.Get)('matchups/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "viewSessionMatchUps", null);
__decorate([
    (0, common_1.Post)('start/:matchId'),
    __param(0, (0, common_1.Param)('matchId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "startMatchInSession", null);
__decorate([
    (0, common_1.Get)('details/:matchId'),
    __param(0, (0, common_1.Param)('matchId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "viewMatchDetails", null);
__decorate([
    (0, common_1.Post)('end/:matchId'),
    __param(0, (0, common_1.Param)('matchId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "endMatchInSession", null);
exports.MatchesController = MatchesController = __decorate([
    (0, common_1.Controller)('match'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [typeof (_a = typeof matches_service_1.MatchesService !== "undefined" && matches_service_1.MatchesService) === "function" ? _a : Object])
], MatchesController);


/***/ }),

/***/ "./src/matches/matches.module.ts":
/*!***************************************!*\
  !*** ./src/matches/matches.module.ts ***!
  \***************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MatchesModule = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const matches_repository_1 = __webpack_require__(/*! src/matches/matches.repository */ "./src/matches/matches.repository.ts");
const matches_controller_1 = __webpack_require__(/*! ./matches.controller */ "./src/matches/matches.controller.ts");
const matches_service_1 = __webpack_require__(/*! ./matches.service */ "./src/matches/matches.service.ts");
const sets_repository_1 = __webpack_require__(/*! src/sets/sets.repository */ "./src/sets/sets.repository.ts");
const sessions_repository_1 = __webpack_require__(/*! src/sessions/sessions.repository */ "./src/sessions/sessions.repository.ts");
let MatchesModule = class MatchesModule {
};
exports.MatchesModule = MatchesModule;
exports.MatchesModule = MatchesModule = __decorate([
    (0, common_2.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: common_1.Match.name, schema: common_1.MatchSchema },
                { name: common_1.Session.name, schema: common_1.SessionSchema },
                { name: common_1.Set.name, schema: common_1.SetSchema },
            ]),
        ],
        controllers: [matches_controller_1.MatchesController],
        providers: [matches_service_1.MatchesService, matches_repository_1.MatchRepository, sets_repository_1.SetRepository, sessions_repository_1.SessionRepository],
        exports: [matches_service_1.MatchesService],
    })
], MatchesModule);


/***/ }),

/***/ "./src/matches/matches.repository.ts":
/*!*******************************************!*\
  !*** ./src/matches/matches.repository.ts ***!
  \*******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MatchRepository_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MatchRepository = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let MatchRepository = MatchRepository_1 = class MatchRepository extends common_2.AbstractRepository {
    constructor(MatchModel) {
        super(MatchModel);
        this.logger = new common_1.Logger(MatchRepository_1.name);
    }
};
exports.MatchRepository = MatchRepository;
exports.MatchRepository = MatchRepository = MatchRepository_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(common_2.Match.name)),
    __metadata("design:paramtypes", [typeof (_a = typeof mongoose_2.Model !== "undefined" && mongoose_2.Model) === "function" ? _a : Object])
], MatchRepository);


/***/ }),

/***/ "./src/matches/matches.service.ts":
/*!****************************************!*\
  !*** ./src/matches/matches.service.ts ***!
  \****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MatchesService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const matches_repository_1 = __webpack_require__(/*! ./matches.repository */ "./src/matches/matches.repository.ts");
const sets_repository_1 = __webpack_require__(/*! ../sets/sets.repository */ "./src/sets/sets.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const sessions_repository_1 = __webpack_require__(/*! src/sessions/sessions.repository */ "./src/sessions/sessions.repository.ts");
let MatchesService = class MatchesService {
    constructor(matchRepository, setRepository, sessionRepository) {
        this.matchRepository = matchRepository;
        this.setRepository = setRepository;
        this.sessionRepository = sessionRepository;
    }
    async viewSetForSession(sessionId) {
        return await this.setRepository.find({ session: sessionId });
    }
    async matchUp(sessionId) {
        const sets = await this.viewSetForSession(sessionId);
        const session = await this.sessionRepository.findOne({ _id: sessionId });
        if (!session) {
            throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
        }
        const sessionMatchType = session.matchType;
        if (!sets || sets.length === 0) {
            throw new common_2.CustomHttpException('No sets found for this session', common_1.HttpStatus.NOT_FOUND);
        }
        const expectedLength = sets.length / 2;
        const availableSets = sets.map((set) => set._id);
        if (availableSets.length % 2 !== 0) {
            throw new common_2.CustomHttpException('Cannot create pairs with an odd number of sets', common_1.HttpStatus.BAD_REQUEST);
        }
        const existingMatchUp = await this.matchRepository.find({
            session: sessionId,
        });
        const alreadyMatched = existingMatchUp.length >= expectedLength;
        if (alreadyMatched) {
            throw new common_2.CustomHttpException('Teams already matched for this session', common_1.HttpStatus.BAD_REQUEST);
        }
        const matchUps = [];
        while (availableSets.length > 0) {
            const randomIndex1 = Math.floor(Math.random() * availableSets.length);
            const randomTeam1 = availableSets[randomIndex1];
            availableSets.splice(randomIndex1, 1);
            const randomIndex2 = Math.floor(Math.random() * availableSets.length);
            const randomTeam2 = availableSets[randomIndex2];
            availableSets.splice(randomIndex2, 1);
            matchUps.push({
                teamOne: randomTeam1,
                teamTwo: randomTeam2,
                matchType: sessionMatchType,
            });
        }
        return await this.matchRepository.insertMany(matchUps);
    }
    async viewSessionMatchUps(sessionId) {
        const matches = await this.matchRepository.findAndPopulate({ session: sessionId }, ['teamOne', 'teamTwo']);
        if (!matches || matches.length === 0) {
            throw new common_2.CustomHttpException('No matchups exist in this session yet', common_1.HttpStatus.NOT_FOUND);
        }
        return matches;
    }
    async startMatch(matchId) {
        const match = await this.matchRepository.findOneAndPopulate({ _id: matchId }, ['teamOne', 'teamTwo']);
        if (!match) {
            throw new common_2.CustomHttpException('Match not found', common_1.HttpStatus.NOT_FOUND);
        }
        const updatedMatch = await this.matchRepository.findOneAndUpdate({ _id: matchId }, { isStarted: true });
        return {
            message: `${match.teamOne.name} vs ${match.teamTwo.name} is underway`,
            match: updatedMatch,
        };
    }
    async endMatch(matchId) {
        const match = await this.matchRepository.findOneAndPopulate({ _id: matchId }, ['teamOne', 'teamTwo']);
        if (!match) {
            throw new common_2.CustomHttpException('Match not found', common_1.HttpStatus.NOT_FOUND);
        }
        const updatedMatch = await this.matchRepository.findOneAndUpdate({ _id: matchId }, { isStarted: false });
        return {
            message: `Final Score- ${match.teamOne.name}:${match.teamOneScore} vs ${match.teamTwo.name}:${match.teamTwoScore}`,
            match: updatedMatch,
        };
    }
    async viewMatchDetails(matchId) {
        const match = await this.matchRepository.findOneAndPopulate({ _id: matchId }, ['teamOne', 'teamTwo']);
        if (!match) {
            throw new common_2.CustomHttpException('Match not found', common_1.HttpStatus.NOT_FOUND);
        }
        return match;
    }
};
exports.MatchesService = MatchesService;
exports.MatchesService = MatchesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof matches_repository_1.MatchRepository !== "undefined" && matches_repository_1.MatchRepository) === "function" ? _a : Object, typeof (_b = typeof sets_repository_1.SetRepository !== "undefined" && sets_repository_1.SetRepository) === "function" ? _b : Object, typeof (_c = typeof sessions_repository_1.SessionRepository !== "undefined" && sessions_repository_1.SessionRepository) === "function" ? _c : Object])
], MatchesService);


/***/ }),

/***/ "./src/sessions/dto/sessions.dto.ts":
/*!******************************************!*\
  !*** ./src/sessions/dto/sessions.dto.ts ***!
  \******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createSessionRequest = void 0;
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class createSessionRequest {
}
exports.createSessionRequest = createSessionRequest;
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], createSessionRequest.prototype, "setNumber", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], createSessionRequest.prototype, "playersPerTeam", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], createSessionRequest.prototype, "timeDuration", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], createSessionRequest.prototype, "minsPerSet", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], createSessionRequest.prototype, "startTime", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], createSessionRequest.prototype, "winningDecider", void 0);


/***/ }),

/***/ "./src/sessions/sessions.controller.ts":
/*!*********************************************!*\
  !*** ./src/sessions/sessions.controller.ts ***!
  \*********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SessionsController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const jwt_guard_1 = __webpack_require__(/*! src/auth/guards/jwt.guard */ "./src/auth/guards/jwt.guard.ts");
const sessions_service_1 = __webpack_require__(/*! ./sessions.service */ "./src/sessions/sessions.service.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const sessions_dto_1 = __webpack_require__(/*! ./dto/sessions.dto */ "./src/sessions/dto/sessions.dto.ts");
let SessionsController = class SessionsController {
    constructor(sessionsService) {
        this.sessionsService = sessionsService;
    }
    async findNearbySessionMatches(data) {
        console.log(data);
        return this.sessionsService.findNearbySessionMatches(data.lng, data.lat);
    }
    async viewAllSessions() {
        return this.sessionsService.viewAllSessions();
    }
    async startSession(data, user) {
        return this.sessionsService.startSession(user._id.toString(), data.locationId);
    }
    async createSession(sessionId, data, user) {
        return this.sessionsService.createSession(data, user._id.toString(), sessionId);
    }
    async joinSession(sessionId, user) {
        return this.sessionsService.joinSession(user._id.toString(), sessionId);
    }
    async viewSession(sessionId) {
        return this.sessionsService.viewSession(sessionId);
    }
    async viewSessionMembers(sessionId) {
        return this.sessionsService.viewSessionMembers(sessionId);
    }
    async leaveSession(sessionId, user) {
        return this.sessionsService.leaveSession(user._id.toString(), sessionId);
    }
    async endSession(sessionId) {
        return this.sessionsService.endSession(sessionId);
    }
    async deleteSession(sessionId) {
        return this.sessionsService.deleteSession(sessionId);
    }
    async rescheduleSession(sessionId, data) {
        return this.sessionsService.recheduleSession(sessionId, data.startTime, data.timeDuration);
    }
    async updateManySession() {
        return await this.sessionsService.updateAllSessions();
    }
};
exports.SessionsController = SessionsController;
__decorate([
    (0, common_1.Post)('nearby-sessions'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "findNearbySessionMatches", null);
__decorate([
    (0, common_1.Get)('all'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "viewAllSessions", null);
__decorate([
    (0, common_1.Post)('start'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_2.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_b = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "startSession", null);
__decorate([
    (0, common_1.Post)('create/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_2.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_c = typeof sessions_dto_1.createSessionRequest !== "undefined" && sessions_dto_1.createSessionRequest) === "function" ? _c : Object, typeof (_d = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "createSession", null);
__decorate([
    (0, common_1.Post)('join/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_2.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_e = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "joinSession", null);
__decorate([
    (0, common_1.Get)(':sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "viewSession", null);
__decorate([
    (0, common_1.Get)('members/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "viewSessionMembers", null);
__decorate([
    (0, common_1.Delete)('leave/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_2.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_f = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "leaveSession", null);
__decorate([
    (0, common_1.Post)('end/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "endSession", null);
__decorate([
    (0, common_1.Delete)('delete/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "deleteSession", null);
__decorate([
    (0, common_1.Patch)('reschedule/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "rescheduleSession", null);
__decorate([
    (0, common_1.Patch)('matchtype'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "updateManySession", null);
exports.SessionsController = SessionsController = __decorate([
    (0, common_1.Controller)('sessions'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [typeof (_a = typeof sessions_service_1.SessionsService !== "undefined" && sessions_service_1.SessionsService) === "function" ? _a : Object])
], SessionsController);


/***/ }),

/***/ "./src/sessions/sessions.module.ts":
/*!*****************************************!*\
  !*** ./src/sessions/sessions.module.ts ***!
  \*****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SessionsModule = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const sessions_service_1 = __webpack_require__(/*! ./sessions.service */ "./src/sessions/sessions.service.ts");
const sessions_controller_1 = __webpack_require__(/*! ./sessions.controller */ "./src/sessions/sessions.controller.ts");
const users_repository_1 = __webpack_require__(/*! src/users/users.repository */ "./src/users/users.repository.ts");
const locations_repository_1 = __webpack_require__(/*! src/locations/locations.repository */ "./src/locations/locations.repository.ts");
const matches_repository_1 = __webpack_require__(/*! src/matches/matches.repository */ "./src/matches/matches.repository.ts");
const sessions_repository_1 = __webpack_require__(/*! ./sessions.repository */ "./src/sessions/sessions.repository.ts");
let SessionsModule = class SessionsModule {
};
exports.SessionsModule = SessionsModule;
exports.SessionsModule = SessionsModule = __decorate([
    (0, common_2.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: common_1.Session.name, schema: common_1.SessionSchema },
                { name: common_1.User.name, schema: common_1.UserSchema },
                { name: common_1.Location.name, schema: common_1.LocationSchema },
                { name: common_1.Match.name, schema: common_1.MatchSchema },
            ]),
        ],
        controllers: [sessions_controller_1.SessionsController],
        providers: [
            sessions_service_1.SessionsService,
            sessions_repository_1.SessionRepository,
            users_repository_1.UserRepository,
            locations_repository_1.LocationRepository,
            matches_repository_1.MatchRepository,
        ],
        exports: [sessions_service_1.SessionsService],
    })
], SessionsModule);


/***/ }),

/***/ "./src/sessions/sessions.repository.ts":
/*!*********************************************!*\
  !*** ./src/sessions/sessions.repository.ts ***!
  \*********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SessionRepository_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SessionRepository = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let SessionRepository = SessionRepository_1 = class SessionRepository extends common_2.AbstractRepository {
    constructor(SessionModel) {
        super(SessionModel);
        this.logger = new common_1.Logger(SessionRepository_1.name);
    }
    async updateAllSessions() {
    }
};
exports.SessionRepository = SessionRepository;
exports.SessionRepository = SessionRepository = SessionRepository_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(common_2.Session.name)),
    __metadata("design:paramtypes", [typeof (_a = typeof mongoose_2.Model !== "undefined" && mongoose_2.Model) === "function" ? _a : Object])
], SessionRepository);


/***/ }),

/***/ "./src/sessions/sessions.service.ts":
/*!******************************************!*\
  !*** ./src/sessions/sessions.service.ts ***!
  \******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SessionsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const sessions_repository_1 = __webpack_require__(/*! ../sessions/sessions.repository */ "./src/sessions/sessions.repository.ts");
const locations_repository_1 = __webpack_require__(/*! ../locations/locations.repository */ "./src/locations/locations.repository.ts");
const matches_repository_1 = __webpack_require__(/*! ../matches/matches.repository */ "./src/matches/matches.repository.ts");
const users_repository_1 = __webpack_require__(/*! ../users/users.repository */ "./src/users/users.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const constants_1 = __webpack_require__(/*! src/config/constants */ "./src/config/constants.ts");
let SessionsService = class SessionsService {
    constructor(sessionRepository, locationRepository, matchRepository, userRepository) {
        this.sessionRepository = sessionRepository;
        this.locationRepository = locationRepository;
        this.matchRepository = matchRepository;
        this.userRepository = userRepository;
    }
    async findNearbySessionMatches(lng, lat) {
        try {
            const nearbyLocations = await this.locationRepository.find({
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [lng, lat],
                        },
                    },
                },
            });
            console.log(nearbyLocations);
            const locationIds = nearbyLocations.map((loc) => loc._id);
            const locatedSessions = await this.sessionRepository.find({
                location: { $in: locationIds },
            });
            const sessionIds = locatedSessions.map((session) => session._id);
            return this.matchRepository.findAndPopulate({ session: { $in: sessionIds } }, ['teamOne', 'teamTwo']);
        }
        catch (error) {
            console.error('Error Finding sessions:', error);
            throw new common_2.CustomHttpException('Error Finding sessions: ' + (error?.message || error), common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async startSession(userId, locationId) {
        const user = await this.userRepository.findOne({ _id: userId });
        const location = await this.locationRepository.findOne({ _id: locationId });
        if (!location)
            throw new common_2.CustomHttpException('Location not found', common_1.HttpStatus.NOT_FOUND);
        if (user == null) {
            throw new common_2.CustomHttpException('User not found', common_1.HttpStatus.NOT_FOUND);
        }
        await this.userRepository.findOneAndUpdate({
            _id: userId,
        }, { isCaptain: true });
        const session = await this.sessionRepository.create({
            location: locationId,
            captain: userId,
        });
        await this.userRepository.findOneAndUpdate({ _id: userId }, { currentSession: session._id });
        return session;
    }
    async createSession({ setNumber, playersPerTeam, timeDuration, minsPerSet, startTime, winningDecider, }, userId, sessionId) {
        const user = await this.userRepository.findOne({ _id: userId });
        const session = await this.sessionRepository.findOne({ _id: sessionId });
        if (session === null) {
            throw new common_2.CustomHttpException('Session does not exist', common_1.HttpStatus.NOT_FOUND);
        }
        if (!user.isCaptain) {
            throw new common_2.CustomHttpException('You are not a captain', common_1.HttpStatus.UNAUTHORIZED);
        }
        const addedStopTime = new Date(new Date(startTime).getTime() + timeDuration * 60000);
        const existingSchedule = await this.sessionRepository.findOne({
            startTime,
            stopTime: addedStopTime,
        });
        if (existingSchedule !== null) {
            throw new common_2.CustomHttpException('Session Time already exists', common_1.HttpStatus.CONFLICT);
        }
        const overlappingSchedule = await this.sessionRepository.findOne({
            startTime: { $lt: new Date(addedStopTime) },
            stopTime: { $gt: new Date(startTime) },
        });
        if (overlappingSchedule !== null) {
            throw new common_2.CustomHttpException('This session overlaps with another session', common_1.HttpStatus.CONFLICT);
        }
        const maxNumber = playersPerTeam * setNumber;
        const newSession = await this.sessionRepository.findOneAndUpdate({
            _id: sessionId,
        }, {
            setNumber,
            playersPerTeam,
            minsPerSet,
            startTime,
            stopTime: addedStopTime,
            winningDecider,
            maxNumber,
        });
        return newSession;
    }
    async endSession(sessionId) {
        const session = await this.sessionRepository.findOne({
            _id: sessionId,
        });
        if (!session)
            throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
        await Promise.all(session.members.map(async (memberId) => {
            const user = await this.userRepository.findOne({
                _id: memberId.toString(),
            });
            if (user !== null) {
                await this.userRepository.findOneAndUpdate({ _id: memberId.toString() }, { currentSession: null, isCaptain: false });
            }
        }));
        await this.sessionRepository.findOneAndUpdate({
            _id: session._id.toString(),
        }, { captain: null, inProgress: false });
        return { message: 'Session ended successfully', session };
    }
    async joinSession(userId, sessionId) {
        const session = await this.sessionRepository.findOne({ _id: sessionId });
        if (!session)
            throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
        if (session.members.includes(userId)) {
            throw new common_2.CustomHttpException('User is already in the session', common_1.HttpStatus.CONFLICT);
        }
        if (session.isFull) {
            throw new common_2.CustomHttpException('Session is full', common_1.HttpStatus.BAD_REQUEST);
        }
        const updatedSession = await this.sessionRepository.findOneAndUpdate({ _id: sessionId }, {
            $push: { members: userId },
            $set: { isFull: session.members.length + 1 >= session.maxNumber },
        });
        await this.userRepository.findOneAndUpdate({ _id: userId }, { currentSession: sessionId });
        return {
            message: 'User successfully joined session',
            session: updatedSession,
        };
    }
    async leaveSession(userId, sessionId) {
        const session = await this.sessionRepository.findOne({
            _id: sessionId,
        });
        if (!session)
            throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
        const user = await this.userRepository.findOne({ _id: userId });
        if (!user)
            throw new common_2.CustomHttpException('User not found', common_1.HttpStatus.NOT_FOUND);
        try {
            await this.sessionRepository.findOneAndUpdate({ _id: sessionId }, {
                $pull: { members: userId },
                $set: { isFull: session.members.length - 1 >= session.maxNumber },
            });
            await this.userRepository.findOneAndUpdate({ _id: userId }, { currentSession: null });
            const updatedSession = await this.sessionRepository.findOne({
                _id: sessionId,
            });
            return {
                message: 'User successfully left session',
                session: updatedSession,
            };
        }
        catch (error) {
            throw new common_2.CustomHttpException('Failed to leave session', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async viewSessionMembers(sessionId) {
        const session = await this.sessionRepository.findOneAndPopulate({
            _id: sessionId,
        }, ['members']);
        if (session === null) {
            throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
        }
        if (!session.members || session.members.length === 0) {
            throw new common_2.CustomHttpException('No members have joined yet', common_1.HttpStatus.NOT_FOUND);
        }
        const nicknames = session.members.map((member) => member.nickname);
        return nicknames;
    }
    async viewSession(sessionId) {
        const verifySession = await this.sessionRepository.findOne({
            _id: sessionId,
        });
        if (verifySession === null) {
            throw new common_2.CustomHttpException('Session does not exist', common_1.HttpStatus.NOT_FOUND);
        }
        return await this.sessionRepository
            .findRaw()
            .findOne({
            _id: sessionId,
        })
            .populate({
            path: 'members',
            select: 'nickname -_id',
        })
            .populate({
            path: 'members',
            select: 'nickname -_id',
        });
    }
    async viewAllSessions() {
        return this.sessionRepository.findAndPopulate({ finished: false }, [
            'captain',
            'members',
            'location',
        ]);
    }
    async deleteSession(sessionId) {
        const session = await this.sessionRepository.findOne({
            _id: sessionId,
        });
        if (!session)
            throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
        const updateQuery = {
            $set: { currentSession: null, isCaptain: false },
        };
        await this.userRepository.updateMany({ _id: { $in: session.members } }, updateQuery);
        await this.sessionRepository.delete(session._id);
        return { message: 'Session deleted successfully' };
    }
    async recheduleSession(sessionId, startTime, timeDuration) {
        const session = await this.sessionRepository.findOne({ _id: sessionId });
        if (!session) {
            throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
        }
        const addedStopTime = new Date(new Date(startTime).getTime() + timeDuration * 60000);
        const existingSchedule = await this.sessionRepository.findOne({
            startTime,
            stopTime: addedStopTime,
        });
        if (existingSchedule) {
            throw new common_2.CustomHttpException('Session Time already exists', common_1.HttpStatus.CONFLICT);
        }
        const overlappingSchedule = await this.sessionRepository.findOne({
            _id: { $ne: sessionId },
            startTime: { $lt: addedStopTime },
            stopTime: { $gt: startTime },
        });
        if (overlappingSchedule) {
            throw new common_2.CustomHttpException('This session overlaps with another one', common_1.HttpStatus.CONFLICT);
        }
        const updatedSession = await this.sessionRepository.findOneAndUpdate({ _id: sessionId }, {
            startTime,
            timeDuration,
            stopTime: addedStopTime,
        });
        return {
            message: 'Session rescheduled successfully',
            session: updatedSession,
        };
    }
    async updateAllSessions() {
        try {
            const filter = {};
            const update = {
                $set: { matchType: constants_1.MATCH_TYPE.FRIENDLY },
            };
            const updatedResult = await this.sessionRepository.updateMany(filter, update);
            console.log("Updating with filter:", filter);
            console.log("Updating with update:", update);
            return updatedResult;
        }
        catch (error) {
            console.error('Error updating sessions:', error);
            throw new common_2.CustomHttpException('Error updating sessions: ' + (error?.message || error), common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.SessionsService = SessionsService;
exports.SessionsService = SessionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof sessions_repository_1.SessionRepository !== "undefined" && sessions_repository_1.SessionRepository) === "function" ? _a : Object, typeof (_b = typeof locations_repository_1.LocationRepository !== "undefined" && locations_repository_1.LocationRepository) === "function" ? _b : Object, typeof (_c = typeof matches_repository_1.MatchRepository !== "undefined" && matches_repository_1.MatchRepository) === "function" ? _c : Object, typeof (_d = typeof users_repository_1.UserRepository !== "undefined" && users_repository_1.UserRepository) === "function" ? _d : Object])
], SessionsService);


/***/ }),

/***/ "./src/sets/sets.controller.ts":
/*!*************************************!*\
  !*** ./src/sets/sets.controller.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SetsController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const jwt_guard_1 = __webpack_require__(/*! src/auth/guards/jwt.guard */ "./src/auth/guards/jwt.guard.ts");
const sets_service_1 = __webpack_require__(/*! ./sets.service */ "./src/sets/sets.service.ts");
let SetsController = class SetsController {
    constructor(setsService) {
        this.setsService = setsService;
    }
    async createSet(sessionId) {
        return await this.setsService.createSet(sessionId);
    }
    async viewSetForSession(sessionId) {
        return await this.setsService.viewSetForSession(sessionId);
    }
    async viewSingleSet(setId) {
        return this.setsService.viewSingleSet(setId);
    }
    async viewAllSets() {
        return this.setsService.viewAllSets();
    }
};
exports.SetsController = SetsController;
__decorate([
    (0, common_1.Post)('create/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SetsController.prototype, "createSet", null);
__decorate([
    (0, common_1.Get)('sets/:sessionId'),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SetsController.prototype, "viewSetForSession", null);
__decorate([
    (0, common_1.Get)(':setId'),
    __param(0, (0, common_1.Param)('setId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SetsController.prototype, "viewSingleSet", null);
__decorate([
    (0, common_1.Get)('sets'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SetsController.prototype, "viewAllSets", null);
exports.SetsController = SetsController = __decorate([
    (0, common_1.Controller)('sets'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [typeof (_a = typeof sets_service_1.SetsService !== "undefined" && sets_service_1.SetsService) === "function" ? _a : Object])
], SetsController);


/***/ }),

/***/ "./src/sets/sets.module.ts":
/*!*********************************!*\
  !*** ./src/sets/sets.module.ts ***!
  \*********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SetsModule = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const sets_controller_1 = __webpack_require__(/*! ./sets.controller */ "./src/sets/sets.controller.ts");
const sets_service_1 = __webpack_require__(/*! ./sets.service */ "./src/sets/sets.service.ts");
const sets_repository_1 = __webpack_require__(/*! ./sets.repository */ "./src/sets/sets.repository.ts");
const sessions_repository_1 = __webpack_require__(/*! src/sessions/sessions.repository */ "./src/sessions/sessions.repository.ts");
let SetsModule = class SetsModule {
};
exports.SetsModule = SetsModule;
exports.SetsModule = SetsModule = __decorate([
    (0, common_2.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: common_1.Set.name, schema: common_1.SetSchema },
                { name: common_1.Session.name, schema: common_1.SessionSchema },
            ]),
        ],
        controllers: [sets_controller_1.SetsController],
        providers: [sets_repository_1.SetRepository, sets_service_1.SetsService, sessions_repository_1.SessionRepository],
        exports: [sets_service_1.SetsService],
    })
], SetsModule);


/***/ }),

/***/ "./src/sets/sets.repository.ts":
/*!*************************************!*\
  !*** ./src/sets/sets.repository.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SetRepository_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SetRepository = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let SetRepository = SetRepository_1 = class SetRepository extends common_2.AbstractRepository {
    constructor(SetModel) {
        super(SetModel);
        this.logger = new common_1.Logger(SetRepository_1.name);
    }
};
exports.SetRepository = SetRepository;
exports.SetRepository = SetRepository = SetRepository_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(common_2.Set.name)),
    __metadata("design:paramtypes", [typeof (_a = typeof mongoose_2.Model !== "undefined" && mongoose_2.Model) === "function" ? _a : Object])
], SetRepository);


/***/ }),

/***/ "./src/sets/sets.service.ts":
/*!**********************************!*\
  !*** ./src/sets/sets.service.ts ***!
  \**********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SetsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const sets_repository_1 = __webpack_require__(/*! ./sets.repository */ "./src/sets/sets.repository.ts");
const sessions_repository_1 = __webpack_require__(/*! ../sessions/sessions.repository */ "./src/sessions/sessions.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
let SetsService = class SetsService {
    constructor(setRepository, sessionRepository) {
        this.setRepository = setRepository;
        this.sessionRepository = sessionRepository;
        this.setNames = [
            'Team 7',
            'Royal Knights',
            'Bouillon Fc',
            'Sepulcher FC',
            'Akatsuki',
            'Amapiano FC',
            'Grey Fc',
            'Dynasty',
            'Elon Musk Fc',
            'J-boys FC',
            'Sporty9ja',
            'Wizkidfc',
            '30BG',
            'Valdomites',
            'OV-Hoes',
            'Outsiders',
            'Celeboys',
            'Azonto FC',
            'Akara warriors',
            'Egusi FC',
        ];
    }
    async allocateMembers(session, createdSets) {
        const members = session.members;
        const pickedMembers = createdSets.flatMap((set) => set.players);
        const availablePlayers = members.filter((member) => !pickedMembers.includes(member));
        if (availablePlayers.length === 0)
            return;
        for (let i = 0; i < members.length; i++) {
            const player = availablePlayers[i];
            const setIndex = i % createdSets.length;
            const pickedSet = createdSets[setIndex];
            await this.setRepository.findOneAndUpdate({ _id: pickedSet._id }, { $push: { players: player } });
        }
    }
    async createSet(sessionId) {
        const session = await this.sessionRepository.findOne({ _id: sessionId });
        if (!session) {
            throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
        }
        const existingSets = await this.setRepository.find({ session: sessionId });
        const usedNames = existingSets.map((set) => set.name);
        const availableNames = this.setNames.filter((name) => !usedNames.includes(name));
        if (availableNames.length < session.setNumber) {
            throw new common_2.CustomHttpException('Not enough unique names available for the session', common_1.HttpStatus.BAD_REQUEST);
        }
        const count = await this.setRepository
            .findRaw()
            .countDocuments({ session: sessionId });
        if (session.maxNumber >= count) {
            throw new common_2.CustomHttpException('Set already created', common_1.HttpStatus.BAD_REQUEST);
        }
        const setData = Array(session.setNumber)
            .fill(null)
            .map(() => {
            const randomIndex = Math.floor(Math.random() * availableNames.length);
            const randomName = availableNames.splice(randomIndex, 1)[0];
            return {
                session: session._id,
                name: randomName,
                players: [],
            };
        });
        const createdSets = await this.setRepository.insertMany(setData);
        await this.allocateMembers(session, createdSets);
        return {
            message: 'Sets created successfully',
            sets: createdSets,
        };
    }
    async viewAllSets() {
        return this.setRepository.findAndPopulate({}, ['players']);
    }
    async viewSetForSession(sessionId) {
        return this.setRepository.findAndPopulate({ session: sessionId }, [
            'players',
        ]);
    }
    async viewSingleSet(setId) {
        const set = await this.setRepository.findAndPopulate({ _id: setId }, [
            'players',
        ]);
        if (!set) {
            throw new common_2.CustomHttpException('Set not found', common_1.HttpStatus.NOT_FOUND);
        }
        return set;
    }
};
exports.SetsService = SetsService;
exports.SetsService = SetsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof sets_repository_1.SetRepository !== "undefined" && sets_repository_1.SetRepository) === "function" ? _a : Object, typeof (_b = typeof sessions_repository_1.SessionRepository !== "undefined" && sessions_repository_1.SessionRepository) === "function" ? _b : Object])
], SetsService);


/***/ }),

/***/ "./src/users/dto/user.dto.ts":
/*!***********************************!*\
  !*** ./src/users/dto/user.dto.ts ***!
  \***********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ResetPasswordDto = exports.VerifyOtpDto = exports.ForgotPasswordDto = exports.registerUserRequest = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class registerUserRequest {
}
exports.registerUserRequest = registerUserRequest;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], registerUserRequest.prototype, "firstName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], registerUserRequest.prototype, "lastName", void 0);
__decorate([
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], registerUserRequest.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], registerUserRequest.prototype, "nickname", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], registerUserRequest.prototype, "password", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], registerUserRequest.prototype, "address", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsPhoneNumber)('NG'),
    __metadata("design:type", String)
], registerUserRequest.prototype, "phoneNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], registerUserRequest.prototype, "position", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", typeof (_a = typeof common_1.LocationCoordinates !== "undefined" && common_1.LocationCoordinates) === "function" ? _a : Object)
], registerUserRequest.prototype, "location", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Boolean)
], registerUserRequest.prototype, "isOwner", void 0);
class ForgotPasswordDto {
}
exports.ForgotPasswordDto = ForgotPasswordDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ForgotPasswordDto.prototype, "email", void 0);
class VerifyOtpDto {
}
exports.VerifyOtpDto = VerifyOtpDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], VerifyOtpDto.prototype, "otp", void 0);
class ResetPasswordDto {
}
exports.ResetPasswordDto = ResetPasswordDto;
__decorate([
    (0, class_validator_1.IsEmail)({}, { message: 'Invalid email format' }),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MinLength)(6, { message: 'Password must be at least 6 characters long' }),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "newPassword", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "confirmPassword", void 0);


/***/ }),

/***/ "./src/users/users.controller.ts":
/*!***************************************!*\
  !*** ./src/users/users.controller.ts ***!
  \***************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const users_service_1 = __webpack_require__(/*! ./users.service */ "./src/users/users.service.ts");
const user_dto_1 = __webpack_require__(/*! ./dto/user.dto */ "./src/users/dto/user.dto.ts");
const jwt_guard_1 = __webpack_require__(/*! src/auth/guards/jwt.guard */ "./src/auth/guards/jwt.guard.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
let UsersController = class UsersController {
    constructor(usersService) {
        this.usersService = usersService;
    }
    async register(request) {
        return this.usersService.registerUser(request);
    }
    async forgetPassword(data) {
        return this.usersService.forgetPassword(data);
    }
    async verifyOtp(data) {
        return this.usersService.verifyOtp(data);
    }
    async resetPassword(data) {
        return this.usersService.resetPassword(data);
    }
    async getUser(user) {
        return this.usersService.getUser(user._id.toString());
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof user_dto_1.registerUserRequest !== "undefined" && user_dto_1.registerUserRequest) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('forget-password'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof user_dto_1.ForgotPasswordDto !== "undefined" && user_dto_1.ForgotPasswordDto) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "forgetPassword", null);
__decorate([
    (0, common_1.Post)('verify-otp'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof user_dto_1.VerifyOtpDto !== "undefined" && user_dto_1.VerifyOtpDto) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "verifyOtp", null);
__decorate([
    (0, common_1.Put)('reset-password'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof user_dto_1.ResetPasswordDto !== "undefined" && user_dto_1.ResetPasswordDto) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Get)(),
    __param(0, (0, common_2.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_f = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getUser", null);
exports.UsersController = UsersController = __decorate([
    (0, common_1.Controller)('user'),
    __metadata("design:paramtypes", [typeof (_a = typeof users_service_1.UsersService !== "undefined" && users_service_1.UsersService) === "function" ? _a : Object])
], UsersController);


/***/ }),

/***/ "./src/users/users.module.ts":
/*!***********************************!*\
  !*** ./src/users/users.module.ts ***!
  \***********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const users_controller_1 = __webpack_require__(/*! ./users.controller */ "./src/users/users.controller.ts");
const users_service_1 = __webpack_require__(/*! ./users.service */ "./src/users/users.service.ts");
const users_repository_1 = __webpack_require__(/*! ./users.repository */ "./src/users/users.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const auth_service_1 = __webpack_require__(/*! ../auth/auth.service */ "./src/auth/auth.service.ts");
const local_strategy_1 = __webpack_require__(/*! ../auth/strategy/local.strategy */ "./src/auth/strategy/local.strategy.ts");
const jwt_strategy_1 = __webpack_require__(/*! ../auth/strategy/jwt.strategy */ "./src/auth/strategy/jwt.strategy.ts");
const jwt_1 = __webpack_require__(/*! @nestjs/jwt */ "@nestjs/jwt");
let UsersModule = class UsersModule {
};
exports.UsersModule = UsersModule;
exports.UsersModule = UsersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: common_2.User.name, schema: common_2.UserSchema }]),
        ],
        controllers: [users_controller_1.UsersController],
        providers: [
            users_service_1.UsersService,
            users_repository_1.UserRepository,
            auth_service_1.AuthService,
            local_strategy_1.UserLocalStrategy,
            jwt_strategy_1.UsersJwtStrategy,
            jwt_1.JwtService,
            common_2.MailerService,
        ],
        exports: [users_service_1.UsersService],
    })
], UsersModule);


/***/ }),

/***/ "./src/users/users.repository.ts":
/*!***************************************!*\
  !*** ./src/users/users.repository.ts ***!
  \***************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var UserRepository_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UserRepository = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let UserRepository = UserRepository_1 = class UserRepository extends common_2.AbstractRepository {
    constructor(UserModel) {
        super(UserModel);
        this.logger = new common_1.Logger(UserRepository_1.name);
    }
};
exports.UserRepository = UserRepository;
exports.UserRepository = UserRepository = UserRepository_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(common_2.User.name)),
    __metadata("design:paramtypes", [typeof (_a = typeof mongoose_2.Model !== "undefined" && mongoose_2.Model) === "function" ? _a : Object])
], UserRepository);


/***/ }),

/***/ "./src/users/users.service.ts":
/*!************************************!*\
  !*** ./src/users/users.service.ts ***!
  \************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var UsersService_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const users_repository_1 = __webpack_require__(/*! ./users.repository */ "./src/users/users.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const bcrypt = __webpack_require__(/*! bcrypt */ "bcrypt");
const crypto = __webpack_require__(/*! crypto */ "crypto");
let UsersService = UsersService_1 = class UsersService {
    constructor(usersRepository, mailService) {
        this.usersRepository = usersRepository;
        this.mailService = mailService;
        this.logger = new common_1.Logger(UsersService_1.name);
    }
    async registerUser({ firstName, lastName, nickname, email, password, phoneNumber, address, position, location, isOwner }) {
        const formattedPhone = (0, common_2.internationalisePhoneNumber)(phoneNumber);
        await this.checkExistingUser(phoneNumber, email, nickname);
        const payload = {
            email,
            phoneNumber: formattedPhone,
            password: await bcrypt.hash(password, 10),
            address,
            lastName,
            firstName,
            location,
            position,
            isOwner,
            nickname
        };
        try {
            const user = await this.usersRepository.create(payload);
            return user;
        }
        catch (error) {
            throw new common_2.CustomHttpException(`can not process request. Try again later ${JSON.stringify(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getUser(id) {
        return await this.usersRepository.findOne({
            _id: id
        });
    }
    async forgetPassword(data) {
        const user = await this.usersRepository.findOne({
            email: data.email,
        });
        if (user == null) {
            throw new common_2.CustomHttpException('User with email does not exist', common_1.HttpStatus.NOT_FOUND);
        }
        const otp = crypto.randomInt(100000, 999999);
        await this.usersRepository.findOneAndUpdate({
            _id: user._id.toString(),
        }, {
            otp,
            otpVerified: false,
            otpExpiration: new Date(Date.now() + 15 * 60 * 1000),
        });
        await this.mailService.sendMail(user.email, 'PASSWORD RESET OTP', `Your OTP for password reset is ${otp}. It is valid for 15 mins`);
    }
    async verifyOtp(data) {
        const user = await this.usersRepository.findOne({
            email: data.email,
        });
        if (user == null) {
            throw new common_2.CustomHttpException('User with email does not exist', common_1.HttpStatus.NOT_FOUND);
        }
        if (user.otp !== data.otp || user.otpExpiration < new Date()) {
            throw new common_2.CustomHttpException('Invalid or expired OTP', common_1.HttpStatus.UNAUTHORIZED);
        }
        await this.usersRepository.findOneAndUpdate({
            _id: user._id.toString(),
        }, { otpVerified: true });
        return { message: 'OTP verified, proceed to reset password' };
    }
    async resetPassword(dto) {
        const user = await this.usersRepository.findOne({ email: dto.email });
        if (user == null)
            throw new common_2.CustomHttpException('User not found', common_1.HttpStatus.NOT_FOUND);
        if (!user.otpVerified)
            throw new common_2.CustomHttpException('OTP not verified', common_1.HttpStatus.UNAUTHORIZED);
        if (dto.newPassword !== dto.confirmPassword) {
            throw new common_2.CustomHttpException('Passwords do not match', common_1.HttpStatus.CONFLICT);
        }
        await this.usersRepository.findOneAndUpdate({
            _id: user._id.toString(),
        }, {
            otp: null,
            otpVerified: false,
            otpExpiration: null,
            password: await bcrypt.hash(dto.newPassword, 10),
        });
        return { message: 'Password reset successful' };
    }
    async checkExistingUser(phoneNumber, email, nickname) {
        const _phone = await this.usersRepository.findOne({
            phoneNumber,
        });
        const _email = await this.usersRepository.findOne({ email });
        const _nickname = await this.usersRepository.findOne({
            nickname,
        });
        if (_phone !== null) {
            throw new common_2.CustomHttpException('Phone Number is  already registered.', common_1.HttpStatus.CONFLICT);
        }
        if (_email !== null) {
            throw new common_2.CustomHttpException('Email is  already registered.', common_1.HttpStatus.CONFLICT);
        }
        if (_nickname !== null) {
            throw new common_2.CustomHttpException('Nickname already exists', common_1.HttpStatus.CONFLICT);
        }
        return _phone;
    }
    async getProfile(id) {
        try {
            const profile = await this.usersRepository.findOne({ _id: id });
            if (profile === null) {
                throw new common_1.NotFoundException('No profile with the given Id');
            }
            profile.password = '';
            return profile;
        }
        catch (error) {
            this.logger.error({
                message: `Failed to fetch user profile ${id} `,
                error,
            });
            if (error instanceof common_1.NotFoundException) {
                throw new common_2.CustomHttpException('No user found with the given ID', common_1.HttpStatus.UNAUTHORIZED);
            }
            else {
                throw new common_2.CustomHttpException(error, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
    }
    async validateUser(email, password) {
        const user = await this.usersRepository.findOne({
            email: email.toLowerCase(),
        });
        if (user === null) {
            throw new common_2.CustomHttpException('User with email is not found', common_1.HttpStatus.NOT_FOUND);
        }
        const isCorrectPassword = await bcrypt.compare(password, user.password);
        if (!isCorrectPassword) {
            throw new common_2.CustomHttpException('Incorrect password', common_1.HttpStatus.UNAUTHORIZED);
        }
        user.password = '';
        return user;
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = UsersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof users_repository_1.UserRepository !== "undefined" && users_repository_1.UserRepository) === "function" ? _a : Object, typeof (_b = typeof common_2.MailerService !== "undefined" && common_2.MailerService) === "function" ? _b : Object])
], UsersService);


/***/ }),

/***/ "@nestjs/common":
/*!*********************************!*\
  !*** external "@nestjs/common" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("@nestjs/common");

/***/ }),

/***/ "@nestjs/config":
/*!*********************************!*\
  !*** external "@nestjs/config" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("@nestjs/config");

/***/ }),

/***/ "@nestjs/core":
/*!*******************************!*\
  !*** external "@nestjs/core" ***!
  \*******************************/
/***/ ((module) => {

module.exports = require("@nestjs/core");

/***/ }),

/***/ "@nestjs/jwt":
/*!******************************!*\
  !*** external "@nestjs/jwt" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("@nestjs/jwt");

/***/ }),

/***/ "@nestjs/mongoose":
/*!***********************************!*\
  !*** external "@nestjs/mongoose" ***!
  \***********************************/
/***/ ((module) => {

module.exports = require("@nestjs/mongoose");

/***/ }),

/***/ "@nestjs/passport":
/*!***********************************!*\
  !*** external "@nestjs/passport" ***!
  \***********************************/
/***/ ((module) => {

module.exports = require("@nestjs/passport");

/***/ }),

/***/ "@nestjs/schedule":
/*!***********************************!*\
  !*** external "@nestjs/schedule" ***!
  \***********************************/
/***/ ((module) => {

module.exports = require("@nestjs/schedule");

/***/ }),

/***/ "bcrypt":
/*!*************************!*\
  !*** external "bcrypt" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("bcrypt");

/***/ }),

/***/ "class-validator":
/*!**********************************!*\
  !*** external "class-validator" ***!
  \**********************************/
/***/ ((module) => {

module.exports = require("class-validator");

/***/ }),

/***/ "cookie-parser":
/*!********************************!*\
  !*** external "cookie-parser" ***!
  \********************************/
/***/ ((module) => {

module.exports = require("cookie-parser");

/***/ }),

/***/ "express":
/*!**************************!*\
  !*** external "express" ***!
  \**************************/
/***/ ((module) => {

module.exports = require("express");

/***/ }),

/***/ "mongoose":
/*!***************************!*\
  !*** external "mongoose" ***!
  \***************************/
/***/ ((module) => {

module.exports = require("mongoose");

/***/ }),

/***/ "nodemailer":
/*!*****************************!*\
  !*** external "nodemailer" ***!
  \*****************************/
/***/ ((module) => {

module.exports = require("nodemailer");

/***/ }),

/***/ "passport-jwt":
/*!*******************************!*\
  !*** external "passport-jwt" ***!
  \*******************************/
/***/ ((module) => {

module.exports = require("passport-jwt");

/***/ }),

/***/ "passport-local":
/*!*********************************!*\
  !*** external "passport-local" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("passport-local");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("crypto");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;
/*!*********************!*\
  !*** ./src/main.ts ***!
  \*********************/

Object.defineProperty(exports, "__esModule", ({ value: true }));
const core_1 = __webpack_require__(/*! @nestjs/core */ "@nestjs/core");
const app_module_1 = __webpack_require__(/*! ./app.module */ "./src/app.module.ts");
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const cookieParser = __webpack_require__(/*! cookie-parser */ "cookie-parser");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: [
            'http://localhost:4500',
        ],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Accept',
            'Origin',
            'X-Requested-With',
            'Access-Control-Request-Method',
            'Access-Control-Request-Headers'
        ],
        exposedHeaders: ['Set-Cookie'],
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true,
    });
    const httpAdapter = app.get(core_1.HttpAdapterHost);
    app.use(cookieParser());
    app.useGlobalPipes(new common_2.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.useGlobalFilters(new common_1.GlobalExceptionFilter(httpAdapter));
    app.setGlobalPrefix('i-one');
    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

})();

/******/ })()
;