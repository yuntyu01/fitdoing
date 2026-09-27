# lock-engine

Android 잠금 엔진 (Expo 로컬 모듈, Kotlin). Phase 3에서 만든다.

- `android/core/`: RN 의존성 없는 순수 엔진 (스케줄러, AlarmManager, BootReceiver, 포그라운드 서비스, UsageStats 감시, 지오펜스, 상태 저장)
- `android/bridge/`: Expo 브리지 (startLock, releaseLock, getLockState, setSchedule, onLockStarted, onLockReleased)

모든 판단은 기기 안에서 한다. 네트워크 없이 동작해야 한다.
