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
__exportStar(__webpack_require__(/*! ./schemas/team.schema */ "./libs/common/src/schemas/team.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/group.schema */ "./libs/common/src/schemas/group.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/tournament-location.schema */ "./libs/common/src/schemas/tournament-location.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/tournament-match.schema */ "./libs/common/src/schemas/tournament-match.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./schemas/tournament.schema */ "./libs/common/src/schemas/tournament.schema.ts"), exports);
__exportStar(__webpack_require__(/*! ./utils/phone.number */ "./libs/common/src/utils/phone.number.ts"), exports);
__exportStar(__webpack_require__(/*! ./typings/global.interface */ "./libs/common/src/typings/global.interface.ts"), exports);
__exportStar(__webpack_require__(/*! ./decorators/currentUser.decorator */ "./libs/common/src/decorators/currentUser.decorator.ts"), exports);
__exportStar(__webpack_require__(/*! ./decorators/isOwner.decorator */ "./libs/common/src/decorators/isOwner.decorator.ts"), exports);
__exportStar(__webpack_require__(/*! ./filters/http-exception.filter copy */ "./libs/common/src/filters/http-exception.filter copy.ts"), exports);
__exportStar(__webpack_require__(/*! ./utils/nodemailer */ "./libs/common/src/utils/nodemailer.ts"), exports);
__exportStar(__webpack_require__(/*! ./utils/phone.number */ "./libs/common/src/utils/phone.number.ts"), exports);
__exportStar(__webpack_require__(/*! ./utils/random */ "./libs/common/src/utils/random.ts"), exports);


/***/ }),

/***/ "./libs/common/src/providers/aws.service.ts":
/*!**************************************************!*\
  !*** ./libs/common/src/providers/aws.service.ts ***!
  \**************************************************/
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
var AwsService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AwsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const client_s3_1 = __webpack_require__(/*! @aws-sdk/client-s3 */ "@aws-sdk/client-s3");
const credential_providers_1 = __webpack_require__(/*! @aws-sdk/credential-providers */ "@aws-sdk/credential-providers");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const config_1 = __webpack_require__(/*! @nestjs/config */ "@nestjs/config");
let AwsService = AwsService_1 = class AwsService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(AwsService_1.name);
        const endpoint = this.configService.get('AWS_S3_ENDPOINT');
        this.AWS_S3_BUCKET = this.configService.get('AWS_S3_BUCKET') || 'i-one';
        this.s3 = new client_s3_1.S3({
            credentials: (0, credential_providers_1.fromEnv)(),
            endpoint,
            forcePathStyle: true,
            region: this.configService.get('AWS_REGION')
        });
    }
    async upload(file, type, identifier) {
        const timestamp = Date.now();
        const randomString = common_2.RandomGen.genRandomString(100, 8);
        const extension = file.mimetype.split('/')[1];
        const Key = `${type}/${identifier || timestamp}/${randomString}.${extension}`;
        const command = new client_s3_1.PutObjectCommand({
            Key,
            Bucket: this.AWS_S3_BUCKET,
            Body: file.buffer,
            ContentType: file.mimetype,
            ContentDisposition: 'inline',
        });
        const baseUrl = this.configService.get('AWS_S3_BASE_URL');
        const url = `${baseUrl}/${Key}`;
        try {
            await this.s3.send(command);
            return url;
        }
        catch (error) {
            this.logger.error({
                message: `Failed to upload ${type} to S3`,
                error,
                key: Key
            });
            return undefined;
        }
    }
};
exports.AwsService = AwsService;
exports.AwsService = AwsService = AwsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], AwsService);


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

/***/ "./libs/common/src/schemas/captains.schema.ts":
/*!****************************************************!*\
  !*** ./libs/common/src/schemas/captains.schema.ts ***!
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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CaptainSchema = exports.Captain = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let Captain = class Captain extends abstract_schema_1.AbstractDocument {
};
exports.Captain = Captain;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", String)
], Captain.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, required: false, ref: 'Set' }),
    __metadata("design:type", String)
], Captain.prototype, "sessionId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Team', required: false }),
    __metadata("design:type", String)
], Captain.prototype, "teamId", void 0);
exports.Captain = Captain = __decorate([
    (0, mongoose_1.Schema)()
], Captain);
exports.CaptainSchema = mongoose_1.SchemaFactory.createForClass(Captain);


/***/ }),

/***/ "./libs/common/src/schemas/group.schema.ts":
/*!*************************************************!*\
  !*** ./libs/common/src/schemas/group.schema.ts ***!
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
exports.GroupSchema = exports.Group = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let Group = class Group {
};
exports.Group = Group;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Group.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ type: mongoose_2.Types.ObjectId, ref: 'Team' }] }),
    __metadata("design:type", Array)
], Group.prototype, "teams", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ type: Object }] }),
    __metadata("design:type", Array)
], Group.prototype, "standings", void 0);
exports.Group = Group = __decorate([
    (0, mongoose_1.Schema)()
], Group);
exports.GroupSchema = mongoose_1.SchemaFactory.createForClass(Group);


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
    (0, mongoose_1.Prop)({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], Location.prototype, "booked", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Location.prototype, "pitchPhoto", void 0);
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
__decorate([
    (0, mongoose_1.Prop)({ type: Boolean, default: true }),
    __metadata("design:type", Boolean)
], Location.prototype, "friendly", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Boolean, default: true }),
    __metadata("design:type", Boolean)
], Location.prototype, "tournament", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, required: false }),
    __metadata("design:type", Number)
], Location.prototype, "tournamentFee", void 0);
exports.Location = Location = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MatchSchema = exports.Match = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
const common_1 = __webpack_require__(/*! ../types/common */ "./libs/common/src/types/common.ts");
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
__decorate([
    (0, mongoose_1.Prop)({ type: String, default: common_1.MATCH_TYPE.FRIENDLY }),
    __metadata("design:type", typeof (_a = typeof common_1.MATCH_TYPE !== "undefined" && common_1.MATCH_TYPE) === "function" ? _a : Object)
], Match.prototype, "matchType", void 0);
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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SessionSchema = exports.Session = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
const common_1 = __webpack_require__(/*! ../types/common */ "./libs/common/src/types/common.ts");
let Session = class Session extends abstract_schema_1.AbstractDocument {
};
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
    (0, mongoose_1.Prop)({ default: common_1.WINNING_DECIDER.PENALTY }),
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
    (0, mongoose_1.Prop)({ type: String, default: common_1.MATCH_TYPE.FRIENDLY }),
    __metadata("design:type", typeof (_c = typeof common_1.MATCH_TYPE !== "undefined" && common_1.MATCH_TYPE) === "function" ? _c : Object)
], Session.prototype, "matchType", void 0);
exports.Session = Session = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, versionKey: false })
], Session);
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
let Set = class Set extends abstract_schema_1.AbstractDocument {
};
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
    (0, mongoose_1.Prop)({ type: [{ type: mongoose_2.Types.ObjectId, ref: 'User' }] }),
    __metadata("design:type", Array)
], Set.prototype, "players", void 0);
exports.Set = Set = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, versionKey: false })
], Set);
exports.SetSchema = mongoose_1.SchemaFactory.createForClass(Set);


/***/ }),

/***/ "./libs/common/src/schemas/stats.schema.ts":
/*!*************************************************!*\
  !*** ./libs/common/src/schemas/stats.schema.ts ***!
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
exports.StatSchema = exports.Stat = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
const mongoose_2 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_3 = __webpack_require__(/*! mongoose */ "mongoose");
let Stat = class Stat extends abstract_schema_1.AbstractDocument {
};
exports.Stat = Stat;
__decorate([
    (0, mongoose_2.Prop)({ type: mongoose_3.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", String)
], Stat.prototype, "userId", void 0);
__decorate([
    (0, mongoose_2.Prop)(),
    __metadata("design:type", Number)
], Stat.prototype, "seasonStart", void 0);
__decorate([
    (0, mongoose_2.Prop)(),
    __metadata("design:type", Number)
], Stat.prototype, "seasonEnd", void 0);
__decorate([
    (0, mongoose_2.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Stat.prototype, "totalMatches", void 0);
__decorate([
    (0, mongoose_2.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Stat.prototype, "goals", void 0);
__decorate([
    (0, mongoose_2.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Stat.prototype, "assists", void 0);
exports.Stat = Stat = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, versionKey: false })
], Stat);
exports.StatSchema = mongoose_1.SchemaFactory.createForClass(Stat);


/***/ }),

/***/ "./libs/common/src/schemas/team.schema.ts":
/*!************************************************!*\
  !*** ./libs/common/src/schemas/team.schema.ts ***!
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
exports.TeamSchema = exports.Team = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
let Team = class Team extends abstract_schema_1.AbstractDocument {
};
exports.Team = Team;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Team.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], Team.prototype, "logo", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], Team.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], Team.prototype, "country", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], Team.prototype, "city", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ type: mongoose_2.Types.ObjectId, ref: 'User' }] }),
    __metadata("design:type", Array)
], Team.prototype, "players", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", String)
], Team.prototype, "captain", void 0);
exports.Team = Team = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, versionKey: false })
], Team);
exports.TeamSchema = mongoose_1.SchemaFactory.createForClass(Team);


/***/ }),

/***/ "./libs/common/src/schemas/tournament-location.schema.ts":
/*!***************************************************************!*\
  !*** ./libs/common/src/schemas/tournament-location.schema.ts ***!
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
exports.TournamentLocationSchema = exports.TournamentLocation = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const common_1 = __webpack_require__(/*! ../types/common */ "./libs/common/src/types/common.ts");
let TournamentLocation = class TournamentLocation {
};
exports.TournamentLocation = TournamentLocation;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TournamentLocation.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TournamentLocation.prototype, "address", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TournamentLocation.prototype, "city", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TournamentLocation.prototype, "country", void 0);
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
], TournamentLocation.prototype, "location", void 0);
exports.TournamentLocation = TournamentLocation = __decorate([
    (0, mongoose_1.Schema)()
], TournamentLocation);
exports.TournamentLocationSchema = mongoose_1.SchemaFactory.createForClass(TournamentLocation);


/***/ }),

/***/ "./libs/common/src/schemas/tournament-match.schema.ts":
/*!************************************************************!*\
  !*** ./libs/common/src/schemas/tournament-match.schema.ts ***!
  \************************************************************/
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
exports.TournamentMatchSchema = exports.TournamentMatch = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const tournament_location_schema_1 = __webpack_require__(/*! ./tournament-location.schema */ "./libs/common/src/schemas/tournament-location.schema.ts");
let TournamentMatch = class TournamentMatch {
};
exports.TournamentMatch = TournamentMatch;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Team' }),
    __metadata("design:type", String)
], TournamentMatch.prototype, "homeTeam", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Team' }),
    __metadata("design:type", String)
], TournamentMatch.prototype, "awayTeam", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Number)
], TournamentMatch.prototype, "homeScore", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Number)
], TournamentMatch.prototype, "awayScore", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", typeof (_a = typeof tournament_location_schema_1.TournamentLocation !== "undefined" && tournament_location_schema_1.TournamentLocation) === "function" ? _a : Object)
], TournamentMatch.prototype, "location", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], TournamentMatch.prototype, "scheduledDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], TournamentMatch.prototype, "completed", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], TournamentMatch.prototype, "stage", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], TournamentMatch.prototype, "group", void 0);
exports.TournamentMatch = TournamentMatch = __decorate([
    (0, mongoose_1.Schema)()
], TournamentMatch);
exports.TournamentMatchSchema = mongoose_1.SchemaFactory.createForClass(TournamentMatch);


/***/ }),

/***/ "./libs/common/src/schemas/tournament.schema.ts":
/*!******************************************************!*\
  !*** ./libs/common/src/schemas/tournament.schema.ts ***!
  \******************************************************/
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
exports.TournamentSchema = exports.Tournament = void 0;
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const global_interface_1 = __webpack_require__(/*! ../typings/global.interface */ "./libs/common/src/typings/global.interface.ts");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
const abstract_schema_1 = __webpack_require__(/*! ./abstract.schema */ "./libs/common/src/schemas/abstract.schema.ts");
let Tournament = class Tournament extends abstract_schema_1.AbstractDocument {
};
exports.Tournament = Tournament;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Tournament.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], Tournament.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Location', required: true }),
    __metadata("design:type", String)
], Tournament.prototype, "location", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Tournament.prototype, "prizeMoney", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, match: /^[a-zA-Z0-9_-]+$/ }),
    __metadata("design:type", String)
], Tournament.prototype, "code", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Tournament.prototype, "registrationFee", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: global_interface_1.TournamentStatus.REGISTRATION }),
    __metadata("design:type", String)
], Tournament.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: global_interface_1.TournamentFormat.KNOCKOUT }),
    __metadata("design:type", String)
], Tournament.prototype, "format", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 32 }),
    __metadata("design:type", Number)
], Tournament.prototype, "maxTeams", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ type: mongoose_2.Types.ObjectId, ref: 'Team' }] }),
    __metadata("design:type", Array)
], Tournament.prototype, "registeredTeams", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Object] }),
    __metadata("design:type", Array)
], Tournament.prototype, "groups", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Object] }),
    __metadata("design:type", Array)
], Tournament.prototype, "matches", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", String)
], Tournament.prototype, "organizer", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], Tournament.prototype, "registrationDeadline", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 1, required: true }),
    __metadata("design:type", Number)
], Tournament.prototype, "durationDays", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], Tournament.prototype, "startDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", typeof (_c = typeof Date !== "undefined" && Date) === "function" ? _c : Object)
], Tournament.prototype, "endDate", void 0);
exports.Tournament = Tournament = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Tournament);
exports.TournamentSchema = mongoose_1.SchemaFactory.createForClass(Tournament);


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
var _a, _b, _c;
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
    (0, mongoose_1.Prop)(Number),
    __metadata("design:type", Number)
], User.prototype, "height", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, unique: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, mongoose_1.Prop)(Date),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], User.prototype, "dateOfBirth", void 0);
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
    __metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
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
    __metadata("design:type", typeof (_c = typeof common_1.LocationCoordinates !== "undefined" && common_1.LocationCoordinates) === "function" ? _c : Object)
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
exports.STATS = exports.WINNING_DECIDER = exports.MATCH_TYPE = void 0;
var MATCH_TYPE;
(function (MATCH_TYPE) {
    MATCH_TYPE["TOURNAMENT"] = "tournament";
    MATCH_TYPE["LEAGUE"] = "league";
    MATCH_TYPE["FRIENDLY"] = "friendly";
})(MATCH_TYPE || (exports.MATCH_TYPE = MATCH_TYPE = {}));
var WINNING_DECIDER;
(function (WINNING_DECIDER) {
    WINNING_DECIDER["PENALTY"] = "penalties";
})(WINNING_DECIDER || (exports.WINNING_DECIDER = WINNING_DECIDER = {}));
var STATS;
(function (STATS) {
    STATS["GOALS"] = "goals";
    STATS["ASSISTS"] = "assists";
})(STATS || (exports.STATS = STATS = {}));


/***/ }),

/***/ "./libs/common/src/typings/global.interface.ts":
/*!*****************************************************!*\
  !*** ./libs/common/src/typings/global.interface.ts ***!
  \*****************************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TournamentFormat = exports.TournamentStatus = exports.UploadType = void 0;
var UploadType;
(function (UploadType) {
    UploadType["PITCH"] = "pitches";
    UploadType["USER_AVATAR"] = "users";
})(UploadType || (exports.UploadType = UploadType = {}));
var TournamentStatus;
(function (TournamentStatus) {
    TournamentStatus["REGISTRATION"] = "registration";
    TournamentStatus["GROUP_STAGE"] = "group_stage";
    TournamentStatus["KNOCKOUT_PHASE"] = "knockout_phase";
    TournamentStatus["COMPLETED"] = "completed";
})(TournamentStatus || (exports.TournamentStatus = TournamentStatus = {}));
var TournamentFormat;
(function (TournamentFormat) {
    TournamentFormat["UCL_CLASSIC"] = "ucl_classic";
    TournamentFormat["SWISS"] = "swiss";
    TournamentFormat["KNOCKOUT"] = "knockout";
    TournamentFormat["LEAGUE"] = "league";
})(TournamentFormat || (exports.TournamentFormat = TournamentFormat = {}));


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

/***/ "./libs/common/src/utils/random.ts":
/*!*****************************************!*\
  !*** ./libs/common/src/utils/random.ts ***!
  \*****************************************/
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RandomGen = void 0;
exports.booleanParser = booleanParser;
exports.RandomGen = {
    genRandomNum: (rounds = 9, length = 7) => {
        const gen = [];
        for (let i = 0; i < length; i++) {
            gen.push(Math.floor(Math.random() * rounds));
        }
        const rando = gen.join('');
        return Number(rando);
    },
    genRandomString: (rounds = 100, length = 7) => {
        const gen = [];
        for (let i = 0; i < length; i++) {
            gen.push(Math.floor(Math.random() * rounds));
        }
        return gen.join('');
    },
    generateAlphanumericString: (length) => {
        if (length <= 6) {
            throw new Error('Length should be greater than 6.');
        }
        const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        const alphaPart = alphabet.slice(0, 2);
        const alphanumericPart = alphabet + numbers;
        const result = alphaPart +
            Array.from({ length: length - 2 }, () => alphanumericPart[Math.floor(Math.random() * alphanumericPart.length)]).join('');
        return result.toUpperCase();
    }
};
function booleanParser(booleanString) {
    return booleanString.length === 4;
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
    healthCheck() {
        return 'I-one server is up and running!';
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "getHello", null);
__decorate([
    (0, common_1.Get)('/healthcheck'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "healthCheck", null);
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
const tournaments_module_1 = __webpack_require__(/*! ./tournaments/tournaments.module */ "./src/tournaments/tournaments.module.ts");
const stats_module_1 = __webpack_require__(/*! ./stats/stats.module */ "./src/stats/stats.module.ts");
const captains_module_1 = __webpack_require__(/*! ./captains/captains.module */ "./src/captains/captains.module.ts");
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
            tournaments_module_1.TournamentsModule,
            stats_module_1.StatsModule,
            captains_module_1.CaptainsModule,
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
        response.json({
            message: "Login successful",
            user
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

/***/ "./src/captains/captains.controller.ts":
/*!*********************************************!*\
  !*** ./src/captains/captains.controller.ts ***!
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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CaptainsController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const captains_service_1 = __webpack_require__(/*! ./captains.service */ "./src/captains/captains.service.ts");
let CaptainsController = class CaptainsController {
    constructor(captainsService) {
        this.captainsService = captainsService;
    }
    async getTeamCaptain(id) {
        return this.captainsService.getTeamCaptain(id);
    }
};
exports.CaptainsController = CaptainsController;
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CaptainsController.prototype, "getTeamCaptain", null);
exports.CaptainsController = CaptainsController = __decorate([
    (0, common_1.Controller)('captains'),
    __metadata("design:paramtypes", [typeof (_a = typeof captains_service_1.CaptainsService !== "undefined" && captains_service_1.CaptainsService) === "function" ? _a : Object])
], CaptainsController);


/***/ }),

/***/ "./src/captains/captains.module.ts":
/*!*****************************************!*\
  !*** ./src/captains/captains.module.ts ***!
  \*****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CaptainsModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const captains_service_1 = __webpack_require__(/*! ./captains.service */ "./src/captains/captains.service.ts");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const captains_schema_1 = __webpack_require__(/*! @app/common/schemas/captains.schema */ "./libs/common/src/schemas/captains.schema.ts");
const captains_controller_1 = __webpack_require__(/*! ./captains.controller */ "./src/captains/captains.controller.ts");
const captains_repository_1 = __webpack_require__(/*! ./captains.repository */ "./src/captains/captains.repository.ts");
let CaptainsModule = class CaptainsModule {
};
exports.CaptainsModule = CaptainsModule;
exports.CaptainsModule = CaptainsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: captains_schema_1.Captain.name, schema: captains_schema_1.CaptainSchema }]),
        ],
        providers: [captains_service_1.CaptainsService, captains_repository_1.CaptainRepository],
        controllers: [captains_controller_1.CaptainsController],
        exports: [captains_service_1.CaptainsService],
    })
], CaptainsModule);


/***/ }),

/***/ "./src/captains/captains.repository.ts":
/*!*********************************************!*\
  !*** ./src/captains/captains.repository.ts ***!
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
var CaptainRepository_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CaptainRepository = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const captains_schema_1 = __webpack_require__(/*! @app/common/schemas/captains.schema */ "./libs/common/src/schemas/captains.schema.ts");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
(0, common_2.Injectable)();
let CaptainRepository = CaptainRepository_1 = class CaptainRepository extends common_1.AbstractRepository {
    constructor(CaptainModel) {
        super(CaptainModel);
        this.logger = new common_2.Logger(CaptainRepository_1.name);
    }
};
exports.CaptainRepository = CaptainRepository;
exports.CaptainRepository = CaptainRepository = CaptainRepository_1 = __decorate([
    __param(0, (0, mongoose_1.InjectModel)(captains_schema_1.Captain.name)),
    __metadata("design:paramtypes", [typeof (_a = typeof mongoose_2.Model !== "undefined" && mongoose_2.Model) === "function" ? _a : Object])
], CaptainRepository);


/***/ }),

/***/ "./src/captains/captains.service.ts":
/*!******************************************!*\
  !*** ./src/captains/captains.service.ts ***!
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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CaptainsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const captains_repository_1 = __webpack_require__(/*! ./captains.repository */ "./src/captains/captains.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const errorHandler_1 = __webpack_require__(/*! src/helpers/errorHandler */ "./src/helpers/errorHandler.ts");
let CaptainsService = class CaptainsService {
    constructor(captainRepository) {
        this.captainRepository = captainRepository;
    }
    async isCaptain(userId, id) {
        const exists = await this.captainRepository.findOne({
            userId: userId,
            $or: [{ teamId: id }, { sessionId: id }],
        });
        if (exists) {
            return true;
        }
        return false;
    }
    async createCaptain(data) {
        try {
            const captainedTeams = await this.captainRepository.find({
                userId: data.userId,
            });
            const isAlreadyCaptain = captainedTeams.some((captain) => {
                if (data.teamId) {
                    return captain.teamId?.toString() === data.teamId;
                }
                else if (data.sessionId) {
                    return captain.sessionId?.toString() === data.sessionId;
                }
                return false;
            });
            if (isAlreadyCaptain) {
                throw new common_2.CustomHttpException('User is already a captain for the specified team or set.', common_1.HttpStatus.CONFLICT);
            }
            const newCaptain = await this.captainRepository.create(data);
            return newCaptain;
        }
        catch (error) {
            (0, errorHandler_1.handleError)(error, 'Failed to create captain.');
        }
    }
    async getTeamCaptain(id) {
        try {
            const captain = await this.captainRepository.findAndPopulate({
                $or: [{ teamId: id }, { setId: id }],
            }, ['userId']);
            if (!captain || captain.length === 0) {
                throw new common_2.CustomHttpException('Captain not found. ', common_1.HttpStatus.NOT_FOUND);
            }
            return captain[0].userId;
        }
        catch (error) {
            (0, errorHandler_1.handleError)(error, 'Failed to retrieve captain.');
        }
    }
};
exports.CaptainsService = CaptainsService;
exports.CaptainsService = CaptainsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof captains_repository_1.CaptainRepository !== "undefined" && captains_repository_1.CaptainRepository) === "function" ? _a : Object])
], CaptainsService);


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

/***/ "./src/helpers/errorHandler.ts":
/*!*************************************!*\
  !*** ./src/helpers/errorHandler.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.handleError = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const handleError = (error, message) => {
    if (error instanceof common_1.CustomHttpException) {
        throw error;
    }
    console.error('Unhandled service error:', error);
    throw new common_1.CustomHttpException(message, common_2.HttpStatus.INTERNAL_SERVER_ERROR);
};
exports.handleError = handleError;


/***/ }),

/***/ "./src/locations/dto/location.dto.ts":
/*!*******************************************!*\
  !*** ./src/locations/dto/location.dto.ts ***!
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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ViewNearbyLocationsDto = exports.CreateLocationDto = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class CreateLocationDto {
}
exports.CreateLocationDto = CreateLocationDto;
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLocationDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLocationDto.prototype, "address", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLocationDto.prototype, "pitchPhoto", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", typeof (_a = typeof common_1.LocationCoordinates !== "undefined" && common_1.LocationCoordinates) === "function" ? _a : Object)
], CreateLocationDto.prototype, "location", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateLocationDto.prototype, "friendly", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateLocationDto.prototype, "tournament", void 0);
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
var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LocationsController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const jwt_guard_1 = __webpack_require__(/*! src/auth/guards/jwt.guard */ "./src/auth/guards/jwt.guard.ts");
const locations_service_1 = __webpack_require__(/*! ./locations.service */ "./src/locations/locations.service.ts");
const location_dto_1 = __webpack_require__(/*! ./dto/location.dto */ "./src/locations/dto/location.dto.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const platform_express_1 = __webpack_require__(/*! @nestjs/platform-express */ "@nestjs/platform-express");
const multer = __webpack_require__(/*! multer */ "multer");
const aws_service_1 = __webpack_require__(/*! @app/common/providers/aws.service */ "./libs/common/src/providers/aws.service.ts");
let LocationsController = class LocationsController {
    constructor(locationsService, awsService) {
        this.locationsService = locationsService;
        this.awsService = awsService;
    }
    async uploadPitchPhoto(file, locationId) {
        const pitchUrl = await this.awsService.upload(file, common_2.UploadType.PITCH, locationId);
        return { pitchPhoto: pitchUrl };
    }
    async viewAllLocations() {
        return this.locationsService.viewAllLocations();
    }
    async registerLocation(user, data) {
        return this.locationsService.registerLocation(data);
    }
    async getNearbyLocations(lng, lat) {
        return this.locationsService.viewNearbyLocations(lng, lat);
    }
    async getMyLocation(user) {
        return this.locationsService.getMyLocation(user._id.toString());
    }
};
exports.LocationsController = LocationsController;
__decorate([
    (0, common_1.Post)('pitch/:locationId'),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Param)('locationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof Express !== "undefined" && (_c = Express.Multer) !== void 0 && _c.File) === "function" ? _d : Object, String]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "uploadPitchPhoto", null);
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
    __metadata("design:paramtypes", [typeof (_e = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _e : Object, typeof (_f = typeof location_dto_1.CreateLocationDto !== "undefined" && location_dto_1.CreateLocationDto) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "registerLocation", null);
__decorate([
    (0, common_1.Get)('nearby'),
    __param(0, (0, common_1.Query)('lng')),
    __param(1, (0, common_1.Query)('lat')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "getNearbyLocations", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_2.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "getMyLocation", null);
exports.LocationsController = LocationsController = __decorate([
    (0, common_1.Controller)('location'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: multer.memoryStorage()
    })),
    __metadata("design:paramtypes", [typeof (_a = typeof locations_service_1.LocationsService !== "undefined" && locations_service_1.LocationsService) === "function" ? _a : Object, typeof (_b = typeof aws_service_1.AwsService !== "undefined" && aws_service_1.AwsService) === "function" ? _b : Object])
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
const aws_service_1 = __webpack_require__(/*! @app/common/providers/aws.service */ "./libs/common/src/providers/aws.service.ts");
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
        providers: [locations_service_1.LocationsService, locations_repository_1.LocationRepository, users_repository_1.UserRepository, aws_service_1.AwsService],
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
const errorHandler_1 = __webpack_require__(/*! src/helpers/errorHandler */ "./src/helpers/errorHandler.ts");
let LocationsService = class LocationsService {
    constructor(locationRepository, userRepository) {
        this.locationRepository = locationRepository;
        this.userRepository = userRepository;
    }
    async registerLocation(locationData) {
        const { name, address, location, pitchPhoto } = locationData;
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
        return await this.locationRepository.create({
            name,
            address,
            location,
            pitchPhoto,
        });
    }
    async viewAllLocations() {
        return await this.locationRepository.find({});
    }
    async viewNearbyLocations(lng, lat) {
        return await this.locationRepository.find({
            'location.coordinates': {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng, lat],
                    },
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
    async getLocationById(locationId) {
        try {
            const location = await this.locationRepository.findOne({
                _id: locationId,
            });
            if (!location) {
                throw new common_2.CustomHttpException('Location not found', common_1.HttpStatus.NOT_FOUND);
            }
            return location;
        }
        catch (error) {
            (0, errorHandler_1.handleError)(error, 'Failed to get location by ID');
        }
    }
};
exports.LocationsService = LocationsService;
exports.LocationsService = LocationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof locations_repository_1.LocationRepository !== "undefined" && locations_repository_1.LocationRepository) === "function" ? _a : Object, typeof (_b = typeof users_repository_1.UserRepository !== "undefined" && users_repository_1.UserRepository) === "function" ? _b : Object])
], LocationsService);


/***/ }),

/***/ "./src/matches/match-event.service.ts":
/*!********************************************!*\
  !*** ./src/matches/match-event.service.ts ***!
  \********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MatchEventService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MatchEventService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const rxjs_1 = __webpack_require__(/*! rxjs */ "rxjs");
let MatchEventService = MatchEventService_1 = class MatchEventService {
    constructor() {
        this.logger = new common_1.Logger(MatchEventService_1.name);
        this.matchscore$ = new rxjs_1.Subject();
        this.matchConnections = new Map();
        this.MAX_CONNECTIONS_PER_MATCH = 500;
    }
    emitMatchScoreUpdate(event) {
        this.logger.log(`Emitting match score update for match ${event.matchId}`);
        this.matchscore$.next(event);
    }
    getScoreUpdates() {
        return this.matchscore$.asObservable();
    }
    canConnect(matchId) {
        const current = this.matchConnections.get(matchId) || 0;
        this.logger.log(`Match ${matchId} has ${current} connections`);
        return current < this.MAX_CONNECTIONS_PER_MATCH;
    }
    addConnection(matchId) {
        const current = this.matchConnections.get(matchId) || 0;
        this.matchConnections.set(matchId, current + 1);
        this.logger.log(`Added connection to match ${matchId}. Total: ${current + 1}`);
    }
    removeConnection(matchId) {
        const current = this.matchConnections.get(matchId) || 0;
        this.matchConnections.set(matchId, Math.max(0, current - 1));
        this.logger.log(`Removed connection from match ${matchId}. Total: ${Math.max(0, current - 1)}`);
    }
    getConnectionCount(matchId) {
        return this.matchConnections.get(matchId) || 0;
    }
};
exports.MatchEventService = MatchEventService;
exports.MatchEventService = MatchEventService = MatchEventService_1 = __decorate([
    (0, common_1.Injectable)()
], MatchEventService);


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
var MatchesController_1;
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MatchesController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const express_1 = __webpack_require__(/*! express */ "express");
const jwt_guard_1 = __webpack_require__(/*! src/auth/guards/jwt.guard */ "./src/auth/guards/jwt.guard.ts");
const matches_service_1 = __webpack_require__(/*! ./matches.service */ "./src/matches/matches.service.ts");
const match_event_service_1 = __webpack_require__(/*! ./match-event.service */ "./src/matches/match-event.service.ts");
const rxjs_1 = __webpack_require__(/*! rxjs */ "rxjs");
let MatchesController = MatchesController_1 = class MatchesController {
    constructor(matchesService, matchEventService) {
        this.matchesService = matchesService;
        this.matchEventService = matchEventService;
        this.logger = new common_1.Logger(MatchesController_1.name);
        this.logger.log('MatchesController initialized');
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
    async incrementMatchScore(matchId, team) {
        return this.matchesService.incrementMatchScore(matchId, team);
    }
    async decrementMatchScore(matchId, team) {
        return this.matchesService.decrementMatchScore(matchId, team);
    }
    matchScoreStream(matchId, response) {
        if (!this.matchEventService.canConnect(matchId)) {
            throw new common_1.HttpException(`Too many connections for match ${matchId}. Maximum ${500} connections allowed.`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        this.matchEventService.addConnection(matchId);
        this.logger.log(`New SSE connection for match ${matchId}`);
        response.on('close', () => {
            this.matchEventService.removeConnection(matchId);
            this.logger.log(`SSE connection closed for match ${matchId}`);
        });
        response.on('error', (error) => {
            this.matchEventService.removeConnection(matchId);
            this.logger.error(`SSE connection error for match ${matchId}:`, error);
        });
        return this.matchEventService.getScoreUpdates().pipe((0, rxjs_1.startWith)({ type: 'connected', message: 'Connection established', matchId }), (0, rxjs_1.map)(update => ({ data: update })), (0, rxjs_1.filter)((envelope) => {
            const update = envelope.data;
            return update.type === 'connected' ||
                update.type === 'heartbeat' ||
                (update.matchId && update.matchId.toString() === matchId);
        }), (0, rxjs_1.catchError)((error) => {
            this.logger.error(`SSE Stream error for match ${matchId}:`, error);
            return (0, rxjs_1.of)({
                data: {
                    type: 'error',
                    message: 'Connection error, retrying...',
                    timestamp: Date.now(),
                    matchId
                }
            });
        }), (0, rxjs_1.retry)({
            count: 3,
            delay: (error, retryCount) => {
                this.logger.warn(`SSE retry ${retryCount} for match ${matchId}:`, error.message);
                return (0, rxjs_1.timer)(1000 * retryCount);
            }
        }), (0, rxjs_1.repeat)({
            delay: () => {
                this.logger.log(`SSE stream restarting for match ${matchId}`);
                return (0, rxjs_1.timer)(1000);
            }
        }));
    }
    streamAllMatches(response) {
        this.logger.log('New global SSE connection established');
        response.on('close', () => {
            this.logger.log('Global SSE connection closed');
        });
        response.on('error', (error) => {
            this.logger.error('Global SSE connection error:', error);
        });
        return this.matchEventService.getScoreUpdates().pipe((0, rxjs_1.startWith)({ type: 'connected', message: 'Global stream connected' }), (0, rxjs_1.map)(update => ({ data: update })), (0, rxjs_1.catchError)((error) => {
            this.logger.error('Global SSE Stream error:', error);
            return (0, rxjs_1.of)({
                data: {
                    type: 'error',
                    message: 'Global stream error, retrying...',
                    timestamp: Date.now(),
                    stream: 'global'
                }
            });
        }), (0, rxjs_1.retry)({
            count: 3,
            delay: (error, retryCount) => {
                this.logger.warn(`Global SSE retry ${retryCount}:`, error.message);
                return (0, rxjs_1.timer)(2000 * retryCount);
            }
        }), (0, rxjs_1.repeat)({
            delay: () => {
                this.logger.log('Global SSE stream restarting');
                return (0, rxjs_1.timer)(2000);
            }
        }));
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
__decorate([
    (0, common_1.Put)('increment-score/:matchId'),
    __param(0, (0, common_1.Param)('matchId')),
    __param(1, (0, common_1.Query)('team')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "incrementMatchScore", null);
__decorate([
    (0, common_1.Put)('decrement-score/:matchId'),
    __param(0, (0, common_1.Param)('matchId')),
    __param(1, (0, common_1.Query)('team')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "decrementMatchScore", null);
__decorate([
    (0, common_1.Sse)('stream/:matchId'),
    __param(0, (0, common_1.Param)('matchId')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_c = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], MatchesController.prototype, "matchScoreStream", null);
__decorate([
    (0, common_1.Sse)('stream'),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof express_1.Response !== "undefined" && express_1.Response) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], MatchesController.prototype, "streamAllMatches", null);
exports.MatchesController = MatchesController = MatchesController_1 = __decorate([
    (0, common_1.Controller)('matches'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [typeof (_a = typeof matches_service_1.MatchesService !== "undefined" && matches_service_1.MatchesService) === "function" ? _a : Object, typeof (_b = typeof match_event_service_1.MatchEventService !== "undefined" && match_event_service_1.MatchEventService) === "function" ? _b : Object])
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
const match_event_service_1 = __webpack_require__(/*! ./match-event.service */ "./src/matches/match-event.service.ts");
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
        providers: [matches_service_1.MatchesService, matches_repository_1.MatchRepository, sets_repository_1.SetRepository, sessions_repository_1.SessionRepository, match_event_service_1.MatchEventService],
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
    async IncrementMatchScore(matchId, team) {
        try {
            const updatedMatch = await this.model.findByIdAndUpdate(matchId, team === 'teamOne'
                ? { $inc: { teamOneScore: 1 } }
                : { $inc: { teamTwoScore: 1 } }, { new: true });
            return updatedMatch.populate(['teamOne', 'teamTwo']);
        }
        catch (error) {
            this.logger.error(`Failed to increment match score for matchId ${matchId}`, error.stack);
            return null;
        }
    }
    async RedecrementMatchScore(matchId, team) {
        try {
            const updatedMatch = await this.model.findByIdAndUpdate(matchId, team === 'teamOne'
                ? { $inc: { teamOneScore: -1 } }
                : { $inc: { teamTwoScore: -1 } }, { new: true });
            return updatedMatch.populate(['teamOne', 'teamTwo']);
        }
        catch (error) {
            this.logger.error(`Failed to decrement match score for matchId ${matchId}`, error.stack);
            return null;
        }
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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MatchesService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const matches_repository_1 = __webpack_require__(/*! ./matches.repository */ "./src/matches/matches.repository.ts");
const sets_repository_1 = __webpack_require__(/*! ../sets/sets.repository */ "./src/sets/sets.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const sessions_repository_1 = __webpack_require__(/*! src/sessions/sessions.repository */ "./src/sessions/sessions.repository.ts");
const mongoose_1 = __webpack_require__(/*! mongoose */ "mongoose");
const match_event_service_1 = __webpack_require__(/*! ./match-event.service */ "./src/matches/match-event.service.ts");
let MatchesService = class MatchesService {
    constructor(matchRepository, setRepository, sessionRepository, matchEventService) {
        this.matchRepository = matchRepository;
        this.setRepository = setRepository;
        this.sessionRepository = sessionRepository;
        this.matchEventService = matchEventService;
    }
    async viewSetForSession(sessionId) {
        return await this.setRepository.find({
            session: new mongoose_1.Types.ObjectId(sessionId),
        });
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
    async incrementMatchScore(matchId, team) {
        const updatedMatch = await this.matchRepository.IncrementMatchScore(matchId, team);
        if (!updatedMatch) {
            throw new common_2.CustomHttpException('Failed to increment match score', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        this.matchEventService.emitMatchScoreUpdate({
            matchId: new mongoose_1.Types.ObjectId(matchId),
            teamOneScore: updatedMatch.teamOneScore,
            teamTwoScore: updatedMatch.teamTwoScore,
        });
        return updatedMatch;
    }
    async decrementMatchScore(matchId, team) {
        const updatedMatch = await this.matchRepository.RedecrementMatchScore(matchId, team);
        if (!updatedMatch) {
            throw new common_2.CustomHttpException('Failed to decrement match score', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
        this.matchEventService.emitMatchScoreUpdate({
            matchId: new mongoose_1.Types.ObjectId(matchId),
            teamOneScore: updatedMatch.teamOneScore,
            teamTwoScore: updatedMatch.teamTwoScore,
        });
        return updatedMatch;
    }
};
exports.MatchesService = MatchesService;
exports.MatchesService = MatchesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof matches_repository_1.MatchRepository !== "undefined" && matches_repository_1.MatchRepository) === "function" ? _a : Object, typeof (_b = typeof sets_repository_1.SetRepository !== "undefined" && sets_repository_1.SetRepository) === "function" ? _b : Object, typeof (_c = typeof sessions_repository_1.SessionRepository !== "undefined" && sessions_repository_1.SessionRepository) === "function" ? _c : Object, typeof (_d = typeof match_event_service_1.MatchEventService !== "undefined" && match_event_service_1.MatchEventService) === "function" ? _d : Object])
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
var _a;
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
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", typeof (_a = typeof Date !== "undefined" && Date) === "function" ? _a : Object)
], createSessionRequest.prototype, "startTime", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
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
    async findNearbySessionMatches(lng, lat) {
        console.log(lng, lat);
        return this.sessionsService.findNearbySessionMatches(lng, lat);
    }
    async viewAllSessions(page = 1, limit = 6) {
        return this.sessionsService.viewAllSessions(page, limit);
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
    (0, common_1.Get)('nearby-sessions'),
    __param(0, (0, common_1.Query)('lng')),
    __param(1, (0, common_1.Query)('lat')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "findNearbySessionMatches", null);
__decorate([
    (0, common_1.Get)('all'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
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
const captains_module_1 = __webpack_require__(/*! src/captains/captains.module */ "./src/captains/captains.module.ts");
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
            captains_module_1.CaptainsModule,
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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SessionsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const sessions_repository_1 = __webpack_require__(/*! ../sessions/sessions.repository */ "./src/sessions/sessions.repository.ts");
const locations_repository_1 = __webpack_require__(/*! ../locations/locations.repository */ "./src/locations/locations.repository.ts");
const matches_repository_1 = __webpack_require__(/*! ../matches/matches.repository */ "./src/matches/matches.repository.ts");
const users_repository_1 = __webpack_require__(/*! ../users/users.repository */ "./src/users/users.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const common_3 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const captains_service_1 = __webpack_require__(/*! src/captains/captains.service */ "./src/captains/captains.service.ts");
let SessionsService = class SessionsService {
    constructor(sessionRepository, locationRepository, matchRepository, userRepository, CaptainService) {
        this.sessionRepository = sessionRepository;
        this.locationRepository = locationRepository;
        this.matchRepository = matchRepository;
        this.userRepository = userRepository;
        this.CaptainService = CaptainService;
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
            if (!nearbyLocations.length) {
                return [];
            }
            const locationIds = nearbyLocations.map((loc) => loc._id);
            const locatedSessions = await this.sessionRepository.find({
                location: { $in: locationIds },
            });
            if (!locatedSessions.length) {
                return [];
            }
            const sessionIds = locatedSessions.map((s) => s._id);
            const matches = await this.matchRepository.findRaw().aggregate([
                {
                    $match: {
                        session: { $in: sessionIds },
                    },
                },
                {
                    $lookup: {
                        from: 'sets',
                        localField: 'teamOne',
                        foreignField: '_id',
                        as: 'teamOne',
                    },
                },
                { $unwind: { path: '$teamOne', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'sets',
                        localField: 'teamTwo',
                        foreignField: '_id',
                        as: 'teamTwo',
                    },
                },
                { $unwind: { path: '$teamTwo', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'sessions',
                        localField: 'session',
                        foreignField: '_id',
                        as: 'session',
                    },
                },
                { $unwind: { path: '$session', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'locations',
                        localField: 'session.location',
                        foreignField: '_id',
                        as: 'session.location',
                    },
                },
                {
                    $unwind: {
                        path: '$session.location',
                        preserveNullAndEmptyArrays: true,
                    },
                },
            ]);
            return matches;
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
        await this.locationRepository.findOneAndUpdate({ _id: locationId }, {
            booked: true,
        });
        const captainDetails = {
            userId: userId,
            sessionId: session._id.toString(),
        };
        await this.CaptainService.createCaptain(captainDetails);
        return session;
    }
    async createSession({ setNumber, playersPerTeam, timeDuration, minsPerSet, startTime, winningDecider, }, userId, sessionId) {
        const session = await this.sessionRepository.findOne({ _id: sessionId });
        if (session === null) {
            throw new common_2.CustomHttpException('Session does not exist', common_1.HttpStatus.NOT_FOUND);
        }
        const isCaptain = await this.CaptainService.isCaptain(userId, sessionId);
        if (!isCaptain) {
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
            location: session.location,
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
            members: [userId],
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
        await this.locationRepository.findOneAndUpdate({
            _id: session.location,
        }, {
            booked: false,
        });
        return { message: 'Session ended successfully', session };
    }
    async joinSession(userId, sessionId) {
        const session = await this.sessionRepository.findOne({ _id: sessionId });
        if (!session)
            throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
        const exists = session.members.some((id) => id.equals(userId));
        if (exists)
            throw new common_2.CustomHttpException('User already in this session', common_1.HttpStatus.CONFLICT);
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
        try {
            const session = await this.sessionRepository
                .findRaw()
                .find({
                _id: sessionId,
            })
                .populate('members', 'firstName lastName nickname');
            if (session === null) {
                throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
            }
            return session;
        }
        catch (error) {
            console.log(error.message);
        }
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
    async viewAllSessions(page = 1, limit = 6) {
        const pageNum = Number(page) || 1;
        const limitNum = Number(limit) || 6;
        const skip = (pageNum - 1) * limitNum;
        const [sessions, total] = await Promise.all([
            this.sessionRepository
                .findRaw()
                .find({ finished: false })
                .populate('captain')
                .populate('members')
                .populate('location')
                .skip(skip)
                .limit(limitNum)
                .sort({ createdAt: -1 }),
            this.sessionRepository.findRaw().countDocuments({ finished: false }),
        ]);
        return {
            sessions,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        };
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
                $set: { matchType: common_3.MATCH_TYPE.FRIENDLY },
            };
            const updatedResult = await this.sessionRepository.updateMany(filter, update);
            console.log('Updating with filter:', filter);
            console.log('Updating with update:', update);
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
    __metadata("design:paramtypes", [typeof (_a = typeof sessions_repository_1.SessionRepository !== "undefined" && sessions_repository_1.SessionRepository) === "function" ? _a : Object, typeof (_b = typeof locations_repository_1.LocationRepository !== "undefined" && locations_repository_1.LocationRepository) === "function" ? _b : Object, typeof (_c = typeof matches_repository_1.MatchRepository !== "undefined" && matches_repository_1.MatchRepository) === "function" ? _c : Object, typeof (_d = typeof users_repository_1.UserRepository !== "undefined" && users_repository_1.UserRepository) === "function" ? _d : Object, typeof (_e = typeof captains_service_1.CaptainsService !== "undefined" && captains_service_1.CaptainsService) === "function" ? _e : Object])
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
    (0, common_1.Get)(':sessionId'),
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
    (0, common_1.Get)(),
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
const mongoose_1 = __webpack_require__(/*! mongoose */ "mongoose");
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
        const members = session.members || [];
        const pickedMembers = createdSets.flatMap((set) => (set.players || [])).map(String);
        const availablePlayers = members
            .map(String)
            .filter((m) => !pickedMembers.includes(m));
        if (availablePlayers.length === 0)
            return;
        const ops = availablePlayers.map((player, i) => ({
            updateOne: {
                filter: { _id: createdSets[i % createdSets.length]._id },
                update: { $addToSet: { players: new mongoose_1.Types.ObjectId(player) } },
            },
        }));
        if (ops.length > 0) {
            await this.setRepository.findRaw().bulkWrite(ops, { ordered: false });
        }
    }
    async createSet(sessionId) {
        try {
            const session = await this.sessionRepository.findOne({ _id: sessionId });
            if (!session) {
                throw new common_2.CustomHttpException('Session not found', common_1.HttpStatus.NOT_FOUND);
            }
            const existingSets = await this.setRepository.find({
                session: sessionId,
            });
            const usedNames = existingSets.map((set) => set.name);
            const availableNames = this.setNames.filter((name) => !usedNames.includes(name));
            if (availableNames.length < session.setNumber) {
                throw new common_2.CustomHttpException('Not enough unique names available for the session', common_1.HttpStatus.BAD_REQUEST);
            }
            const count = await this.setRepository.findRaw().countDocuments({ session: sessionId });
            if (count > 0) {
                throw new common_2.CustomHttpException('Set already created', common_1.HttpStatus.BAD_REQUEST);
            }
            const setData = Array(session.setNumber)
                .fill(null)
                .map(() => {
                const randomIndex = Math.floor(Math.random() * availableNames.length);
                const randomName = availableNames.splice(randomIndex, 1)[0];
                return {
                    _id: new mongoose_1.Types.ObjectId(),
                    session: sessionId,
                    name: randomName,
                    players: [],
                };
            });
            const createdSets = await this.setRepository.insertMany(setData);
            await this.allocateMembers(session, createdSets);
            const updatedSets = await this.setRepository.findAndPopulate({ session: new mongoose_1.Types.ObjectId(sessionId) }, ['players']);
            return {
                message: 'Sets created successfully',
                sets: updatedSets,
            };
        }
        catch (error) {
            console.error('Error creating sets:', error);
            throw new common_2.CustomHttpException(error.message, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
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

/***/ "./src/stats/dto/stats.dto.ts":
/*!************************************!*\
  !*** ./src/stats/dto/stats.dto.ts ***!
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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.updateStatsDto = exports.statsQueryDto = exports.StatsDto = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const class_validator_1 = __webpack_require__(/*! class-validator */ "class-validator");
class StatsDto {
}
exports.StatsDto = StatsDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], StatsDto.prototype, "userId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], StatsDto.prototype, "seasonStart", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], StatsDto.prototype, "seasonEnd", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], StatsDto.prototype, "totalMatches", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], StatsDto.prototype, "goals", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], StatsDto.prototype, "assists", void 0);
class statsQueryDto {
}
exports.statsQueryDto = statsQueryDto;
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], statsQueryDto.prototype, "seasonStart", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], statsQueryDto.prototype, "seasonEnd", void 0);
class updateStatsDto {
}
exports.updateStatsDto = updateStatsDto;
__decorate([
    (0, class_validator_1.IsEnum)(common_1.STATS, { message: 'Invalid stats type' }),
    __metadata("design:type", typeof (_a = typeof common_1.STATS !== "undefined" && common_1.STATS) === "function" ? _a : Object)
], updateStatsDto.prototype, "statsType", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], updateStatsDto.prototype, "value", void 0);


/***/ }),

/***/ "./src/stats/stats.controller.ts":
/*!***************************************!*\
  !*** ./src/stats/stats.controller.ts ***!
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
var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatsController = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const stats_service_1 = __webpack_require__(/*! ./stats.service */ "./src/stats/stats.service.ts");
const stats_dto_1 = __webpack_require__(/*! ./dto/stats.dto */ "./src/stats/dto/stats.dto.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const jwt_guard_1 = __webpack_require__(/*! src/auth/guards/jwt.guard */ "./src/auth/guards/jwt.guard.ts");
let StatsController = class StatsController {
    constructor(statsService) {
        this.statsService = statsService;
    }
    async overallUserStats(user) {
        return this.statsService.overallUserStats(user._id.toString());
    }
    async getUserStatsBySeason(user, query) {
        return this.statsService.getUserStatsBySeason(user._id.toString(), query);
    }
    async updateStats(user, query, updateData) {
        return this.statsService.updateStats(user._id.toString(), query, updateData);
    }
};
exports.StatsController = StatsController;
__decorate([
    (0, common_1.Get)(':userId'),
    __param(0, (0, common_2.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], StatsController.prototype, "overallUserStats", null);
__decorate([
    (0, common_1.Get)('season'),
    __param(0, (0, common_2.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _c : Object, typeof (_d = typeof stats_dto_1.statsQueryDto !== "undefined" && stats_dto_1.statsQueryDto) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], StatsController.prototype, "getUserStatsBySeason", null);
__decorate([
    (0, common_1.Patch)('update'),
    __param(0, (0, common_2.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _e : Object, typeof (_f = typeof stats_dto_1.statsQueryDto !== "undefined" && stats_dto_1.statsQueryDto) === "function" ? _f : Object, typeof (_g = typeof stats_dto_1.updateStatsDto !== "undefined" && stats_dto_1.updateStatsDto) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], StatsController.prototype, "updateStats", null);
exports.StatsController = StatsController = __decorate([
    (0, common_1.Controller)('stats'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [typeof (_a = typeof stats_service_1.StatsService !== "undefined" && stats_service_1.StatsService) === "function" ? _a : Object])
], StatsController);


/***/ }),

/***/ "./src/stats/stats.module.ts":
/*!***********************************!*\
  !*** ./src/stats/stats.module.ts ***!
  \***********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatsModule = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const stats_controller_1 = __webpack_require__(/*! ./stats.controller */ "./src/stats/stats.controller.ts");
const stats_service_1 = __webpack_require__(/*! ./stats.service */ "./src/stats/stats.service.ts");
const stats_repository_1 = __webpack_require__(/*! ./stats.repository */ "./src/stats/stats.repository.ts");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const stats_schema_1 = __webpack_require__(/*! @app/common/schemas/stats.schema */ "./libs/common/src/schemas/stats.schema.ts");
let StatsModule = class StatsModule {
};
exports.StatsModule = StatsModule;
exports.StatsModule = StatsModule = __decorate([
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([{ name: stats_schema_1.Stat.name, schema: stats_schema_1.StatSchema }])],
        controllers: [stats_controller_1.StatsController],
        providers: [stats_service_1.StatsService, stats_repository_1.StatsRepository],
        exports: [stats_service_1.StatsService, stats_repository_1.StatsRepository]
    })
], StatsModule);


/***/ }),

/***/ "./src/stats/stats.repository.ts":
/*!***************************************!*\
  !*** ./src/stats/stats.repository.ts ***!
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
var StatsRepository_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatsRepository = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const stats_schema_1 = __webpack_require__(/*! @app/common/schemas/stats.schema */ "./libs/common/src/schemas/stats.schema.ts");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let StatsRepository = StatsRepository_1 = class StatsRepository extends common_1.AbstractRepository {
    constructor(StatModel) {
        super(StatModel);
        this.logger = new common_2.Logger(StatsRepository_1.name);
    }
};
exports.StatsRepository = StatsRepository;
exports.StatsRepository = StatsRepository = StatsRepository_1 = __decorate([
    (0, common_2.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(stats_schema_1.Stat.name)),
    __metadata("design:paramtypes", [typeof (_a = typeof mongoose_2.Model !== "undefined" && mongoose_2.Model) === "function" ? _a : Object])
], StatsRepository);


/***/ }),

/***/ "./src/stats/stats.service.ts":
/*!************************************!*\
  !*** ./src/stats/stats.service.ts ***!
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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.StatsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const stats_repository_1 = __webpack_require__(/*! ./stats.repository */ "./src/stats/stats.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
let StatsService = class StatsService {
    constructor(statsRepository) {
        this.statsRepository = statsRepository;
    }
    async overallUserStats(userId) {
        try {
            return this.statsRepository.findOne({ userId });
        }
        catch (error) {
            throw new common_2.CustomHttpException(`cannot get user stats ${JSON.stringify(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getUserStatsBySeason(userId, query) {
        try {
            return this.statsRepository.findOne({ userId, ...query });
        }
        catch (error) {
            throw new common_2.CustomHttpException(`cannot get user stats ${JSON.stringify(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async initializeStat(userId) {
        try {
            const startDate = new Date().getFullYear();
            const endDate = startDate + 1;
            const dateData = {
                seasonStart: startDate,
                seasonEnd: endDate,
            };
            const stats = await this.statsRepository.create({
                userId,
                ...dateData,
            });
            return stats;
        }
        catch (error) {
            throw new common_2.CustomHttpException(`cannot initialise user stats ${JSON.stringify(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async createStat(stats) {
        try {
            return this.statsRepository.create(stats);
        }
        catch (error) {
            throw new common_2.CustomHttpException(`cannot create user stats ${JSON.stringify(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateStats(userId, query, updateData) {
        try {
            return this.statsRepository.findOneAndUpdate({ userId, ...query }, {
                $inc: { [updateData.statsType]: updateData.value },
            });
        }
        catch (error) {
            throw new common_2.CustomHttpException(`cannot update user stats ${JSON.stringify(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.StatsService = StatsService;
exports.StatsService = StatsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof stats_repository_1.StatsRepository !== "undefined" && stats_repository_1.StatsRepository) === "function" ? _a : Object])
], StatsService);


/***/ }),

/***/ "./src/tournaments/teams.repository.ts":
/*!*********************************************!*\
  !*** ./src/tournaments/teams.repository.ts ***!
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
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TeamRepository = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let TeamRepository = class TeamRepository extends common_2.AbstractRepository {
    constructor(TeamModel) {
        super(TeamModel);
        this.logger = new common_1.Logger(common_2.Team.name);
    }
};
exports.TeamRepository = TeamRepository;
exports.TeamRepository = TeamRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(common_2.Team.name)),
    __metadata("design:paramtypes", [typeof (_a = typeof mongoose_2.Model !== "undefined" && mongoose_2.Model) === "function" ? _a : Object])
], TeamRepository);


/***/ }),

/***/ "./src/tournaments/teams.service.ts":
/*!******************************************!*\
  !*** ./src/tournaments/teams.service.ts ***!
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
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TeamsService = void 0;
const users_repository_1 = __webpack_require__(/*! src/users/users.repository */ "./src/users/users.repository.ts");
const teams_repository_1 = __webpack_require__(/*! ./teams.repository */ "./src/tournaments/teams.repository.ts");
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
let TeamsService = class TeamsService {
    constructor(userRepository, teamRepository) {
        this.userRepository = userRepository;
        this.teamRepository = teamRepository;
    }
    async create(dto, id) {
        const captain = await this.userRepository.findOne({
            _id: dto.captain,
        });
        if (!captain) {
            throw new common_1.CustomHttpException('Captain user not found', common_2.HttpStatus.NOT_FOUND);
        }
        if (dto.players && dto.players.length > 0) {
            const playerCount = await this.userRepository.findRaw().countDocuments({
                _id: { $in: dto.players },
            });
            if (playerCount !== dto.players.length) {
                throw new common_1.CustomHttpException('One or more player users not found', common_2.HttpStatus.NOT_FOUND);
            }
        }
        const team = await this.teamRepository.create({
            ...dto,
            players: dto.players || [],
        });
        if (!team.players.includes(captain._id.toString())) {
            const updatedTeam = await this.teamRepository.findOneAndUpdate({ _id: team._id }, { $push: { players: captain._id.toString() } });
            return updatedTeam;
        }
        return team;
    }
    async findAll() {
        return this.teamRepository
            .findRaw()
            .find()
            .populate('captain', 'username email')
            .populate('players', 'username email')
            .exec();
    }
    async findOne(id) {
        const team = await this.teamRepository
            .findRaw()
            .findById(id)
            .populate('captain', 'username email')
            .populate('players', 'username email')
            .exec();
        if (!team) {
            throw new common_1.CustomHttpException(`Team with ID ${id} not found`, common_2.HttpStatus.NOT_FOUND);
        }
        return team;
    }
    async update(id, updateTeamDto) {
        const team = await this.teamRepository.findOne({
            _id: id,
        });
        if (!team) {
            throw new common_1.CustomHttpException(`Team with ID ${id} not found`, common_2.HttpStatus.NOT_FOUND);
        }
        if (updateTeamDto.captain) {
            const captain = await this.userRepository.findOne({
                _id: updateTeamDto.captain,
            });
            if (!captain) {
                throw new common_1.CustomHttpException('Captain user not found', common_2.HttpStatus.NOT_FOUND);
            }
        }
        if (updateTeamDto.players && updateTeamDto.players.length > 0) {
            const playerCount = await this.userRepository.findRaw().countDocuments({
                _id: { $in: updateTeamDto.players },
            });
            if (playerCount !== updateTeamDto.players.length) {
                throw new common_1.CustomHttpException('One or more player users not found', common_2.HttpStatus.NOT_FOUND);
            }
        }
        const updatedTeam = await this.teamRepository
            .findRaw()
            .findByIdAndUpdate(id, updateTeamDto, { new: true })
            .populate('captain', 'username email')
            .populate('players', 'username email')
            .exec();
        return updatedTeam;
    }
    async remove(id) {
        const result = await this.teamRepository
            .findRaw()
            .deleteOne({ _id: id })
            .exec();
        if (result.deletedCount === 0) {
            throw new common_1.CustomHttpException(`Team with ID ${id} not found`, common_2.HttpStatus.NOT_FOUND);
        }
    }
    async addPlayer(teamId, userId) {
        const team = await this.teamRepository.findOne({
            _id: teamId,
        });
        if (!team) {
            throw new common_1.CustomHttpException(`Team with ID ${teamId} not found`, common_2.HttpStatus.NOT_FOUND);
        }
        const user = await this.userRepository.findOne({
            _id: userId,
        });
        if (!user) {
            throw new common_1.CustomHttpException(`User with ID ${userId} not found`, common_2.HttpStatus.NOT_FOUND);
        }
        if (team.players.includes(userId)) {
            throw new common_1.CustomHttpException('Player already in team', common_2.HttpStatus.BAD_REQUEST);
        }
        const updatedTeam = await this.teamRepository.findOneAndUpdate({ _id: team._id }, { $push: { players: userId } });
        return updatedTeam;
    }
    async removePlayer(teamId, userId) {
        const team = await this.teamRepository.findOne({
            _id: teamId,
        });
        if (!team) {
            throw new common_1.CustomHttpException(`Team with ID ${teamId} not found`, common_2.HttpStatus.NOT_FOUND);
        }
        if (team.captain.toString() === userId) {
            throw new common_1.CustomHttpException('Cannot remove captain from team', common_2.HttpStatus.BAD_REQUEST);
        }
        return await this.teamRepository.findOneAndUpdate({ _id: team._id }, {
            $pull: { players: userId },
        });
    }
    async getTeamsByUserId(userId) {
        return this.teamRepository
            .findRaw()
            .find({
            $or: [{ captain: userId }, { players: userId }],
        })
            .populate('captain', 'username email')
            .populate('players', 'username email')
            .exec();
    }
};
exports.TeamsService = TeamsService;
exports.TeamsService = TeamsService = __decorate([
    (0, common_2.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof users_repository_1.UserRepository !== "undefined" && users_repository_1.UserRepository) === "function" ? _a : Object, typeof (_b = typeof teams_repository_1.TeamRepository !== "undefined" && teams_repository_1.TeamRepository) === "function" ? _b : Object])
], TeamsService);


/***/ }),

/***/ "./src/tournaments/tournaments.module.ts":
/*!***********************************************!*\
  !*** ./src/tournaments/tournaments.module.ts ***!
  \***********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TournamentsModule = void 0;
const common_1 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const common_2 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const teams_repository_1 = __webpack_require__(/*! ./teams.repository */ "./src/tournaments/teams.repository.ts");
const users_repository_1 = __webpack_require__(/*! src/users/users.repository */ "./src/users/users.repository.ts");
const teams_service_1 = __webpack_require__(/*! ./teams.service */ "./src/tournaments/teams.service.ts");
const tournaments_service_1 = __webpack_require__(/*! ./tournaments.service */ "./src/tournaments/tournaments.service.ts");
const tournaments_repository_1 = __webpack_require__(/*! ./tournaments.repository */ "./src/tournaments/tournaments.repository.ts");
const locations_module_1 = __webpack_require__(/*! src/locations/locations.module */ "./src/locations/locations.module.ts");
let TournamentsModule = class TournamentsModule {
};
exports.TournamentsModule = TournamentsModule;
exports.TournamentsModule = TournamentsModule = __decorate([
    (0, common_2.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: common_1.User.name, schema: common_1.UserSchema },
                { name: common_1.Tournament.name, schema: common_1.TournamentSchema },
                { name: common_1.Team.name, schema: common_1.TeamSchema },
            ]),
            locations_module_1.LocationsModule,
        ],
        controllers: [],
        providers: [
            teams_repository_1.TeamRepository,
            users_repository_1.UserRepository,
            tournaments_repository_1.TournamentRepository,
            teams_service_1.TeamsService,
            tournaments_service_1.TournamentsService,
        ],
        exports: [teams_service_1.TeamsService, tournaments_service_1.TournamentsService],
    })
], TournamentsModule);


/***/ }),

/***/ "./src/tournaments/tournaments.repository.ts":
/*!***************************************************!*\
  !*** ./src/tournaments/tournaments.repository.ts ***!
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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TournamentRepository = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const mongoose_1 = __webpack_require__(/*! @nestjs/mongoose */ "@nestjs/mongoose");
const mongoose_2 = __webpack_require__(/*! mongoose */ "mongoose");
let TournamentRepository = class TournamentRepository extends common_2.AbstractRepository {
    constructor(TournamentModel) {
        super(TournamentModel);
        this.logger = new common_1.Logger(common_2.Tournament.name);
    }
};
exports.TournamentRepository = TournamentRepository;
exports.TournamentRepository = TournamentRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(common_2.Tournament.name)),
    __metadata("design:paramtypes", [typeof (_a = typeof mongoose_2.Model !== "undefined" && mongoose_2.Model) === "function" ? _a : Object])
], TournamentRepository);


/***/ }),

/***/ "./src/tournaments/tournaments.service.ts":
/*!************************************************!*\
  !*** ./src/tournaments/tournaments.service.ts ***!
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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TournamentsService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const tournaments_repository_1 = __webpack_require__(/*! ./tournaments.repository */ "./src/tournaments/tournaments.repository.ts");
const teams_repository_1 = __webpack_require__(/*! ./teams.repository */ "./src/tournaments/teams.repository.ts");
const users_repository_1 = __webpack_require__(/*! src/users/users.repository */ "./src/users/users.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const locations_service_1 = __webpack_require__(/*! src/locations/locations.service */ "./src/locations/locations.service.ts");
let TournamentsService = class TournamentsService {
    constructor(tournamentRepository, teamRepository, locationService, userRepository) {
        this.tournamentRepository = tournamentRepository;
        this.teamRepository = teamRepository;
        this.locationService = locationService;
        this.userRepository = userRepository;
    }
    generateCode() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }
    async create(createTournamentDto, userId, locationId) {
        const location = await this.locationService.getLocationById(locationId);
        if (!location) {
            throw new common_2.CustomHttpException(`Location with ID ${locationId} not found`, common_1.HttpStatus.NOT_FOUND);
        }
        const tournament = await this.tournamentRepository.create({
            ...createTournamentDto,
            registeredTeams: [],
            organizer: userId,
            location: locationId,
            code: this.generateCode(),
            status: common_2.TournamentStatus.REGISTRATION,
            endDate: new Date(createTournamentDto.startDate.getTime() +
                createTournamentDto.durationDays * 24 * 60 * 60 * 1000),
        });
        return tournament;
    }
    async findOne(id) {
        const tournament = await this.tournamentRepository
            .findRaw()
            .findById(id)
            .populate('organizer', 'username email')
            .populate('registeredTeams')
            .populate('location')
            .exec();
        if (!tournament) {
            throw new common_2.CustomHttpException(`Tournament with ID ${id} not found`, common_1.HttpStatus.NOT_FOUND);
        }
        return tournament;
    }
    async update(id, updateTournamentDto) {
        const tournament = await this.tournamentRepository.findOne({
            _id: id,
        });
        if (!tournament) {
            throw new common_2.CustomHttpException(`Tournament with ID ${id} not found`, common_1.HttpStatus.NOT_FOUND);
        }
        const updatedTournament = await this.tournamentRepository
            .findRaw()
            .findByIdAndUpdate(id, updateTournamentDto, { new: true })
            .populate('organizer', 'username email')
            .populate('registeredTeams')
            .exec();
        return updatedTournament;
    }
    async remove(id) {
        const result = await this.tournamentRepository
            .findRaw()
            .deleteOne({ _id: id })
            .exec();
        if (result.deletedCount === 0) {
            throw new common_2.CustomHttpException(`Tournament with ID ${id} not found`, common_1.HttpStatus.NOT_FOUND);
        }
    }
    async registerTeam(tournamentId, registerTeamDto) {
        const tournament = await this.tournamentRepository.findOne({
            _id: tournamentId,
        });
        if (!tournament) {
            throw new common_2.CustomHttpException(`Tournament with ID ${tournamentId} not found`, common_1.HttpStatus.NOT_FOUND);
        }
        if (tournament.status !== common_2.TournamentStatus.REGISTRATION) {
            throw new common_2.CustomHttpException('Tournament is not in registration phase', common_1.HttpStatus.BAD_REQUEST);
        }
        if (tournament.registeredTeams.length >= tournament.maxTeams) {
            throw new common_2.CustomHttpException('Tournament is full', common_1.HttpStatus.BAD_REQUEST);
        }
        const team = await this.teamRepository.findOne({
            _id: registerTeamDto.teamId,
        });
        if (!team) {
            throw new common_2.CustomHttpException(`Team with ID ${registerTeamDto.teamId} not found`, common_1.HttpStatus.NOT_FOUND);
        }
        if (tournament.registeredTeams.some((teamId) => teamId.toString() === registerTeamDto.teamId)) {
            throw new common_2.CustomHttpException('Team is already registered for this tournament', common_1.HttpStatus.BAD_REQUEST);
        }
        return await this.tournamentRepository
            .findRaw()
            .findByIdAndUpdate(tournamentId, {
            $push: { registeredTeams: tournament.registeredTeams },
        })
            .populate('organizer', 'username email')
            .populate('registeredTeams')
            .exec();
    }
    async unregisterTeam(tournamentId, teamId) {
        const tournament = await this.tournamentRepository.findOne({
            _id: tournamentId,
        });
        if (!tournament) {
            throw new common_2.CustomHttpException(`Tournament with ID ${tournamentId} not found`, common_1.HttpStatus.NOT_FOUND);
        }
        if (tournament.status !== common_2.TournamentStatus.REGISTRATION) {
            throw new common_2.CustomHttpException('Tournament is not in registration phase', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!tournament.registeredTeams.some((registeredTeamId) => registeredTeamId.toString() === teamId)) {
            throw new common_2.CustomHttpException('Team is not registered for this tournament', common_1.HttpStatus.BAD_REQUEST);
        }
        tournament.registeredTeams = tournament.registeredTeams.filter((registeredTeamId) => registeredTeamId.toString() !== teamId);
        return this.tournamentRepository
            .findRaw()
            .findByIdAndUpdate(tournamentId, { $pull: { registeredTeams: teamId } }, { new: true })
            .populate('organizer', 'username email')
            .populate('registeredTeams')
            .exec();
    }
    async updateGroupStandings(tournament, match) {
        const groupIndex = tournament.groups.findIndex((g) => g.name === match.group);
        if (groupIndex === -1)
            return;
        const group = tournament.groups[groupIndex];
        const homeTeamIndex = group.standings.findIndex((s) => s.team.toString() === match.homeTeam.toString());
        if (homeTeamIndex !== -1) {
            const homeStanding = group.standings[homeTeamIndex];
            homeStanding.played += 1;
            homeStanding.goalsFor += match.homeScore;
            homeStanding.goalsAgainst += match.awayScore;
            if (match.homeScore > match.awayScore) {
                homeStanding.won += 1;
                homeStanding.points += 3;
            }
            else if (match.homeScore === match.awayScore) {
                homeStanding.drawn += 1;
                homeStanding.points += 1;
            }
            else {
                homeStanding.lost += 1;
            }
            group.standings[homeTeamIndex] = homeStanding;
        }
        const awayTeamIndex = group.standings.findIndex((s) => s.team.toString() === match.awayTeam.toString());
        if (awayTeamIndex !== -1) {
            const awayStanding = group.standings[awayTeamIndex];
            awayStanding.played += 1;
            awayStanding.goalsFor += match.awayScore;
            awayStanding.goalsAgainst += match.homeScore;
            if (match.awayScore > match.homeScore) {
                awayStanding.won += 1;
                awayStanding.points += 3;
            }
            else if (match.awayScore === match.homeScore) {
                awayStanding.drawn += 1;
                awayStanding.points += 1;
            }
            else {
                awayStanding.lost += 1;
            }
            group.standings[awayTeamIndex] = awayStanding;
        }
        group.standings.sort((a, b) => {
            if (a.points !== b.points) {
                return b.points - a.points;
            }
            const aGoalDiff = a.goalsFor - a.goalsAgainst;
            const bGoalDiff = b.goalsFor - b.goalsAgainst;
            if (aGoalDiff !== bGoalDiff) {
                return bGoalDiff - aGoalDiff;
            }
            return b.goalsFor - a.goalsFor;
        });
        tournament.groups[groupIndex] = group;
    }
    async getTournamentsByOrganizerId(organizerId) {
        return this.tournamentRepository
            .findRaw()
            .find({ organizer: organizerId })
            .populate('organizer', 'username email')
            .populate('registeredTeams')
            .exec();
    }
    async getTournamentsByTeamId(teamId) {
        return this.tournamentRepository
            .findRaw()
            .find({ registeredTeams: teamId })
            .populate('organizer', 'username email')
            .populate('registeredTeams')
            .exec();
    }
    async getUpcomingMatches(tournamentId, teamId) {
        const tournament = await this.tournamentRepository.findOne({
            _id: tournamentId,
        });
        if (!tournament) {
            throw new common_2.CustomHttpException(`Tournament with ID ${tournamentId} not found`, common_1.HttpStatus.NOT_FOUND);
        }
        let matches = tournament.matches.filter((match) => !match.completed);
        if (teamId) {
            matches = matches.filter((match) => match.homeTeam?.toString() === teamId ||
                match.awayTeam?.toString() === teamId);
        }
        matches.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
        return matches;
    }
    async getCompletedMatches(tournamentId, teamId) {
        const tournament = await this.tournamentRepository.findOne({
            _id: tournamentId,
        });
        if (!tournament) {
            throw new common_2.CustomHttpException(`Tournament with ID ${tournamentId} not found`, common_1.HttpStatus.NOT_FOUND);
        }
        let matches = tournament.matches.filter((match) => match.completed);
        if (teamId) {
            matches = matches.filter((match) => match.homeTeam?.toString() === teamId ||
                match.awayTeam?.toString() === teamId);
        }
        matches.sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime());
        return matches;
    }
    async getGroupStandings(tournamentId, groupName) {
        const tournament = await this.tournamentRepository.findOne({
            _id: tournamentId,
        });
        if (!tournament) {
            throw new common_2.CustomHttpException(`Tournament with ID ${tournamentId} not found`, common_1.HttpStatus.NOT_FOUND);
        }
        if (groupName) {
            const group = tournament.groups.find((g) => g.name === groupName);
            if (!group) {
                throw new common_2.CustomHttpException(`Group ${groupName} not found in tournament`, common_1.HttpStatus.NOT_FOUND);
            }
            return [group];
        }
        return tournament.groups;
    }
};
exports.TournamentsService = TournamentsService;
exports.TournamentsService = TournamentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof tournaments_repository_1.TournamentRepository !== "undefined" && tournaments_repository_1.TournamentRepository) === "function" ? _a : Object, typeof (_b = typeof teams_repository_1.TeamRepository !== "undefined" && teams_repository_1.TeamRepository) === "function" ? _b : Object, typeof (_c = typeof locations_service_1.LocationsService !== "undefined" && locations_service_1.LocationsService) === "function" ? _c : Object, typeof (_d = typeof users_repository_1.UserRepository !== "undefined" && users_repository_1.UserRepository) === "function" ? _d : Object])
], TournamentsService);


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
var _a, _b;
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
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Number)
], registerUserRequest.prototype, "height", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", typeof (_b = typeof Date !== "undefined" && Date) === "function" ? _b : Object)
], registerUserRequest.prototype, "dateOfBirth", void 0);
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
var _a, _b, _c, _d, _e, _f, _g;
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
    async getProfile(user) {
        return this.usersService.getProfile(user._id.toString());
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
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Get)('profile'),
    __param(0, (0, common_2.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof common_2.User !== "undefined" && common_2.User) === "function" ? _g : Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getProfile", null);
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
const stats_module_1 = __webpack_require__(/*! src/stats/stats.module */ "./src/stats/stats.module.ts");
let UsersModule = class UsersModule {
};
exports.UsersModule = UsersModule;
exports.UsersModule = UsersModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: common_2.User.name, schema: common_2.UserSchema }]),
            stats_module_1.StatsModule,
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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UsersService = void 0;
const common_1 = __webpack_require__(/*! @nestjs/common */ "@nestjs/common");
const users_repository_1 = __webpack_require__(/*! ./users.repository */ "./src/users/users.repository.ts");
const common_2 = __webpack_require__(/*! @app/common */ "./libs/common/src/index.ts");
const bcrypt = __webpack_require__(/*! bcrypt */ "bcrypt");
const crypto = __webpack_require__(/*! crypto */ "crypto");
const stats_service_1 = __webpack_require__(/*! src/stats/stats.service */ "./src/stats/stats.service.ts");
let UsersService = UsersService_1 = class UsersService {
    constructor(usersRepository, mailService, statsService) {
        this.usersRepository = usersRepository;
        this.mailService = mailService;
        this.statsService = statsService;
        this.logger = new common_1.Logger(UsersService_1.name);
    }
    async registerUser({ firstName, lastName, nickname, email, password, phoneNumber, address, position, location, isOwner, height, dateOfBirth, }) {
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
            nickname,
            height,
            dateOfBirth,
        };
        try {
            const user = await this.usersRepository.create(payload);
            await this.statsService.initializeStat(user._id.toString());
            await this.sendWelcomeEmail(user);
            return user;
        }
        catch (error) {
            throw new common_2.CustomHttpException(`can not process request. Try again later ${JSON.stringify(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async sendWelcomeEmail(user) {
        const subject = 'Welcome to I-One App!';
        const body = `Hello ${user.firstName},\n\nWelcome to I-One App! We're excited to have you on board.\n\nBest regards,\nThe I-One Team`;
        await this.mailService.sendMail(user.email, subject, body);
    }
    async getUser(id) {
        return await this.usersRepository.findOne({
            _id: id,
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
        console.log(user);
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
    __metadata("design:paramtypes", [typeof (_a = typeof users_repository_1.UserRepository !== "undefined" && users_repository_1.UserRepository) === "function" ? _a : Object, typeof (_b = typeof common_2.MailerService !== "undefined" && common_2.MailerService) === "function" ? _b : Object, typeof (_c = typeof stats_service_1.StatsService !== "undefined" && stats_service_1.StatsService) === "function" ? _c : Object])
], UsersService);


/***/ }),

/***/ "@aws-sdk/client-s3":
/*!*************************************!*\
  !*** external "@aws-sdk/client-s3" ***!
  \*************************************/
/***/ ((module) => {

module.exports = require("@aws-sdk/client-s3");

/***/ }),

/***/ "@aws-sdk/credential-providers":
/*!************************************************!*\
  !*** external "@aws-sdk/credential-providers" ***!
  \************************************************/
/***/ ((module) => {

module.exports = require("@aws-sdk/credential-providers");

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

/***/ "@nestjs/platform-express":
/*!*******************************************!*\
  !*** external "@nestjs/platform-express" ***!
  \*******************************************/
/***/ ((module) => {

module.exports = require("@nestjs/platform-express");

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

/***/ "multer":
/*!*************************!*\
  !*** external "multer" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("multer");

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

/***/ "rxjs":
/*!***********************!*\
  !*** external "rxjs" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("rxjs");

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
            'https://i-one-sports.com',
            'http://172.20.10.5:4500',
            'http://172.20.10.6:4500'
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