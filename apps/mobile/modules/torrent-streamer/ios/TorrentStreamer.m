#import "TorrentStreamer.h"
#import <React/RCTLog.h>

// Note: iOS implementation requires libtorrent compiled for iOS
// This is a placeholder that will need to be completed with actual libtorrent integration
// Options:
// 1. Use libtorrent-swift (if available)
// 2. Compile libtorrent for iOS and create Objective-C++ wrapper
// 3. Use a pre-built framework

@implementation TorrentStreamer {
    bool hasListeners;
    NSMutableDictionary *sessions;
}

RCT_EXPORT_MODULE()

- (instancetype)init {
    self = [super init];
    if (self) {
        sessions = [[NSMutableDictionary alloc] init];
    }
    return self;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onTorrentProgress", @"onTorrentReady", @"onTorrentError"];
}

- (void)startObserving {
    hasListeners = YES;
}

- (void)stopObserving {
    hasListeners = NO;
}

RCT_EXPORT_METHOD(initialize:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    RCTLogInfo(@"TorrentStreamer: Initializing...");
    
    // TODO: Initialize libtorrent session
    // For now, we'll return success but torrent streaming won't work on iOS until libtorrent is properly integrated
    
    NSString *downloadPath = config[@"downloadPath"];
    if (!downloadPath) {
        NSArray *paths = NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES);
        downloadPath = [paths[0] stringByAppendingPathComponent:@"torrents"];
    }
    
    NSFileManager *fileManager = [NSFileManager defaultManager];
    if (![fileManager fileExistsAtPath:downloadPath]) {
        NSError *error;
        [fileManager createDirectoryAtPath:downloadPath 
               withIntermediateDirectories:YES 
                                attributes:nil 
                                     error:&error];
        if (error) {
            reject(@"INIT_ERROR", @"Failed to create download directory", error);
            return;
        }
    }
    
    resolve(nil);
}

RCT_EXPORT_METHOD(startStream:(NSDictionary *)params
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSString *sessionId = params[@"sessionId"];
    NSString *magnetUri = params[@"magnetUri"];
    
    RCTLogInfo(@"TorrentStreamer: Starting stream for %@", sessionId);
    
    // TODO: Implement actual torrent streaming with libtorrent
    // For now, return an error indicating iOS torrent streaming is not yet implemented
    
    // Placeholder: Store session info
    sessions[sessionId] = @{
        @"magnetUri": magnetUri,
        @"status": @"not_implemented"
    };
    
    // Send error event since iOS implementation is pending
    if (hasListeners) {
        [self sendEventWithName:@"onTorrentError" body:@{
            @"sessionId": sessionId,
            @"error": @"iOS torrent streaming is coming soon. For now, please use debrid services (Real-Debrid, AllDebrid, Premiumize) which work immediately."
        }];
    }
    
    reject(@"NOT_IMPLEMENTED", @"iOS torrent streaming is not yet implemented. Please use debrid services.", nil);
}

RCT_EXPORT_METHOD(stopStream:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [sessions removeObjectForKey:sessionId];
    resolve(nil);
}

RCT_EXPORT_METHOD(stopAll:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [sessions removeAllObjects];
    resolve(nil);
}

RCT_EXPORT_METHOD(getSessionInfo:(NSString *)sessionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSDictionary *session = sessions[sessionId];
    resolve(session);
}

@end
