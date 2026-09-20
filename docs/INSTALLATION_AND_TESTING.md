# Interview Studio 설치 및 테스트 가이드

이 문서는 개인용 alpha 버전 `0.2.5`를 다른 PC에서 내려받아 실행하고, 카메라·마이크·AI CLI를 연결해 첫 면접을 테스트하는 절차를 설명합니다.

## 1. 지원 범위

| 환경 | 상태 | 비고 |
| --- | --- | --- |
| Windows 10 22H2 이상 / Windows 11 x64 | 지원 | 마이크·카메라 테스트의 우선 환경 |
| macOS 13 이상 | 지원 | 현재 배포 파일은 Apple Silicon용 |
| iPhone / iPad의 iOS·iPadOS | 미지원 | Electron, 데스크톱 CLI, 로컬 DB 및 FFmpeg 의존성 때문에 설치 불가 |

질문의 “IOS”가 macOS를 뜻한 경우 아래 macOS 절차를 따르면 됩니다. 실제 iPhone 또는 iPad용 앱은 v1 범위에 포함되어 있지 않습니다.

현재 배포 파일은 코드 서명하지 않은 개인용 alpha입니다. Windows SmartScreen 또는 macOS Gatekeeper 경고가 나타날 수 있습니다. GitHub 저장소의 Release에서 받은 파일인지 확인한 뒤에만 실행하십시오.

## 2. 가장 빠른 Windows 설치

### 2.1 앱 설치

1. 저장소가 private이므로 Windows PC의 브라우저에서 GitHub 계정 `mynameisjinhohong`로 로그인합니다.
2. [Interview Studio Releases](https://github.com/mynameisjinhohong/interview-studio/releases)에서 최신 prerelease를 엽니다.
3. `Interview.Studio-0.2.5-x64.exe`를 내려받습니다.
4. SmartScreen이 표시되면 게시자가 `알 수 없음`인 개인용 alpha임을 확인하고, 신뢰할 수 있는 저장소에서 직접 받은 파일일 때만 `추가 정보` → `실행`을 선택합니다.
5. 설치 위치를 선택해 설치한 뒤 Interview Studio를 실행합니다.

Windows 설치 파일에는 FFmpeg와 `whisper-cli.exe`가 포함됩니다. 음성 모델은 크기가 크므로 앱에서 별도로 내려받습니다.

### 2.2 Node.js와 AI CLI 설치

Interview Studio는 설치된 Codex, Claude 또는 Gemini CLI 중 하나를 호출합니다. 한 개만 준비해도 됩니다. CLI가 Node.js로 설치되는 경우 앱을 실행하기 전에 [Node.js 24](https://nodejs.org/en/download)를 설치하고 새 PowerShell 창을 여십시오.

권장 테스트 순서는 다음과 같습니다.

```powershell
node --version
npm --version
```

둘 중 하나가 인식되지 않으면 Node.js 설치 후 Windows에서 로그아웃·로그인하거나 PC를 재시작합니다.

#### Codex CLI

```powershell
npm install -g @openai/codex
codex login
codex --version
codex login status
```

Codex의 네이티브 Windows 지원은 버전에 따라 제한될 수 있습니다. 이 앱은 Windows 프로세스에서 CLI를 직접 실행하므로 WSL 안에만 설치된 `codex`는 자동 탐색하지 않습니다. 반드시 일반 Windows PowerShell에서도 `codex --version`이 동작하는지 확인하십시오. 공식 안내: [Codex CLI 시작하기](https://help.openai.com/en/articles/11096431)

#### Claude Code

[Git for Windows](https://git-scm.com/download/win)를 먼저 설치한 뒤 실행합니다.

```powershell
npm install -g @anthropic-ai/claude-code
claude
claude doctor
claude --version
```

Git Bash 위치를 자동으로 찾지 못하면 다음 환경 변수를 사용자 환경에 추가한 뒤 앱을 다시 시작합니다.

```powershell
[Environment]::SetEnvironmentVariable(
  "CLAUDE_CODE_GIT_BASH_PATH",
  "C:\Program Files\Git\bin\bash.exe",
  "User"
)
```

공식 안내: [Claude Code 설치](https://docs.anthropic.com/en/docs/claude-code/getting-started)

#### Gemini CLI

```powershell
npm install -g @google/gemini-cli
gemini
gemini --version
```

첫 실행에서 `Sign in with Google`을 선택해 로그인합니다. Gemini CLI 자체의 현재 권장 Windows 환경은 Windows 11 24H2 이상이므로 Windows 10에서는 CLI 호환성을 별도로 확인해야 합니다. 공식 안내: [Gemini CLI 설치](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/installation.mdx)

### 2.3 앱에서 CLI 확인

1. CLI 로그인까지 마친 뒤 Interview Studio를 완전히 종료하고 다시 실행합니다.
2. 최초 화면에서 사용할 CLI를 선택합니다. 단순 설치 확인이 아니라 마지막 단계에서 실제 구조화 LLM 호출까지 검사합니다.
3. `small` STT 모델을 내려받고 `설치됨` 표시를 확인합니다.
4. `설치되어 사용 가능`에서 OS 한국어 음성을 확인합니다. 더 자연스러운 음성을 원하면 Supertonic 2 팩을 다운로드하고 여성 5종·남성 5종 중 하나를 선택합니다.
5. 선택한 면접관 음성 샘플을 끝까지 재생합니다.
6. `모든 설정을 저장하고 시작`을 누릅니다. CLI, STT, 한국어 음성과 샘플 확인이 모두 끝나야 활성화됩니다.
7. 이후에는 `설정`에서 CLI·음성·STT 모델을 변경할 수 있습니다.
8. CLI가 `설치되지 않음`이면 새 PowerShell에서 다음 명령으로 실제 경로를 확인합니다.

```powershell
Get-Command codex -ErrorAction SilentlyContinue
Get-Command claude -ErrorAction SilentlyContinue
Get-Command gemini -ErrorAction SilentlyContinue
npm config get prefix
```

CLI를 설치한 PowerShell에서는 되는데 앱에서만 찾지 못하면 Windows 재로그인 후 다시 검사합니다. 앱은 `%APPDATA%\npm`, `%LOCALAPPDATA%\Programs\nodejs`, `%ProgramFiles%\nodejs`와 시스템 `PATH`를 탐색합니다.

기존 버전에서 업데이트한 경우 프로필과 면접 기록은 유지됩니다. 0.2.4부터 고품질 음성 환경을 확인하기 위해 확장된 최초 설정이 한 번 다시 나타납니다.

### 2.4 프로필 자료 수집 방식

프로필 URL은 다음 순서로 처리됩니다.

1. 앱이 공개 HTML 본문을 직접 추출합니다.
2. JavaScript 렌더링 등으로 직접 추출이 실패하면 선택한 CLI의 공개 웹 기능으로 재시도합니다.
3. 두 방식이 모두 실패하면 해당 자료만 실패로 표시하고 실제 오류를 보존합니다.
4. 성공한 다른 자료가 있으면 컨텍스트 생성은 계속됩니다.
5. LLM이 부족한 정보를 질문으로 만들면 `컨텍스트와 수집 결과` 화면에서 답변을 추가할 수 있습니다.

비공개 Notion이나 로그인 전용 페이지는 우회 수집하지 않습니다. Notion에서 PDF·Markdown을 내보내 파일로 올리거나 `직접 보완 설명`에 본문을 붙여 넣으십시오.

## 3. Windows 장치와 음성 인식 준비

### 3.1 권한

Windows `설정` → `개인 정보 및 보안`에서 다음을 켭니다.

- `마이크` → `마이크 액세스`, `앱에서 마이크에 액세스하도록 허용`, `데스크톱 앱에서 마이크에 액세스하도록 허용`
- `카메라` → `카메라 액세스`, `앱에서 카메라에 액세스하도록 허용`, `데스크톱 앱에서 카메라에 액세스하도록 허용`

카메라는 선택 사항이지만 마이크는 면접 진행에 필수입니다. Teams, Discord, OBS처럼 장치를 독점할 수 있는 앱은 테스트 전에 종료하는 편이 안전합니다.

### 3.2 STT 모델

1. 최초 설정 화면에서 실행 파일에 `whisper-cli.exe` 경로가 표시되는지 확인합니다.
2. 권장 고품질 모델인 `small`을 내려받습니다.
3. 다운로드가 끝나고 `설치됨`으로 바뀐 뒤에만 최초 설정을 완료할 수 있습니다.
4. 이후 설정에서 `base` 또는 `medium`으로 바꿀 수 있지만, 선택 모델이 설치되지 않으면 면접 시작 전 장치 점검이 다운로드를 요구합니다.

모델 다운로드에는 인터넷 연결과 충분한 디스크 공간이 필요합니다. 내려받는 도중 앱을 종료했다면 다시 다운로드하십시오.

### 3.3 면접관 음성 선택

1. 앱의 `설정` → `면접관 음성`을 엽니다.
2. `설치되어 사용 가능`에는 현재 앱이 실제 합성에 쓸 수 있는 음성만 표시됩니다. Windows 기본 한국어 음성은 일반적으로 Microsoft Heami 하나이므로 한 개만 보이는 것이 정상일 수 있습니다.
3. 추가 후보가 필요하면 `Supertonic 2 한국어 고품질 음성`의 `다운로드`를 누릅니다. 약 263MB를 한 번 내려받으며 여성 5종·남성 5종이 추가됩니다.
4. 원하는 음성을 누른 뒤 `선택 음성 샘플`로 실제 질문과 같은 출력 경로를 확인합니다. 모델과 음성 데이터는 로컬에 저장되어 이후 오프라인에서도 동작합니다.

### 3.4 카메라·마이크 점검

1. 새 면접을 만들고 `장치 점검`까지 이동합니다.
2. `장치 확인`으로 마이크 권한과 카메라 미리보기를 확인합니다.
3. 선택된 STT 모델이 설치되지 않았다면 이 화면에서 다운로드합니다.
4. 현재 선택한 면접관 음성 샘플을 재생합니다.
5. 세 항목이 모두 준비된 뒤에만 `면접 시작` 버튼이 활성화됩니다.

## 4. 첫 통합 테스트 시나리오

처음에는 실패 지점을 쉽게 구분할 수 있도록 3개의 본 질문과 연습 모드를 권장합니다.

1. 프로필을 만들고 포트폴리오 URL `https://hongjinho.dev/`를 추가합니다.
2. 컨텍스트 생성이 끝난 뒤 프로젝트·기술·성과 항목이 포함됐는지 확인합니다.
3. `새 세션` → `기술 면접` → `연습 모드`를 선택합니다.
4. 기술 스택 1~2개, 본 질문 3개로 설정합니다.
5. CLI 조사와 질문 생성이 완료되면 장치 점검을 통과합니다.
6. 질문 음성, 답변 녹음, 전사, 꼬리 질문을 순서대로 확인합니다.
7. 세션을 완료하고 결과 화면에서 전사·점수·녹화 타임라인을 확인합니다.
8. PDF와 MP4를 각각 내보내 실제로 열리는지 확인합니다.

회사 면접은 기술 면접이 성공한 뒤 테스트하십시오. 공개 채용 공고 URL과 공고 본문을 함께 넣으면 자료 수집 실패와 사이트 차단의 영향을 줄일 수 있습니다.

## 5. Windows에서 소스로 실행하거나 직접 패키징

설치 파일 대신 현재 소스를 실행하려면 Git, Node.js 24, pnpm 11이 필요합니다. 저장소가 private인 동안에는 GitHub 계정 인증이 필요합니다.

```powershell
git clone https://github.com/mynameisjinhohong/interview-studio.git
cd interview-studio
npm install -g pnpm@11
pnpm install --frozen-lockfile
pnpm dev
```

검증과 Windows 설치 파일 생성:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm package:win
```

생성물은 `release\0.2.5\`에 저장됩니다. 소스로 실행한 경우에는 Release 설치본과 달리 `whisper-cli.exe`가 자동으로 포함되지 않습니다. `whisper.cpp`를 빌드한 뒤 실행 파일과 DLL을 아래 둘 중 한 위치에 함께 두십시오.

- `%APPDATA%\Interview Studio\runtime\bin`
- `%LOCALAPPDATA%\whisper.cpp`

공식 소스와 빌드 안내: [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp)

## 6. macOS 설치와 설정

1. [Releases](https://github.com/mynameisjinhohong/interview-studio/releases)에서 Apple Silicon용 `Interview.Studio-0.2.5-arm64.dmg`를 내려받습니다.
2. 앱을 Applications 폴더로 옮깁니다.
3. 서명되지 않은 alpha 경고가 뜨면 `시스템 설정` → `개인정보 보호 및 보안`에서 차단된 Interview Studio의 `확인 없이 열기`를 선택합니다.
4. 터미널에서 사용할 CLI를 설치하고 로그인한 뒤 앱을 다시 시작합니다.
5. 마이크와 카메라 권한을 허용합니다.
6. Homebrew를 사용한다면 `brew install whisper-cpp`로 `whisper-cli`를 설치할 수 있습니다.
7. 앱 설정에서 `small` 모델을 다운로드합니다.

현재 DMG는 Apple Silicon에서 생성했습니다. Intel Mac은 소스 실행과 직접 패키징이 필요하며 아직 실제 기기 검증을 마치지 않았습니다.

## 7. 데이터 위치와 초기화

모든 프로필 원문, 전사, 평가, 모델과 녹화는 로컬 평문으로 저장됩니다.

- Windows: `%APPDATA%\Interview Studio`
- macOS: `~/Library/Application Support/Interview Studio`

앱 설정의 `모든 데이터 삭제`는 프로필, 세션, 모델과 캐시를 제거합니다. 필요한 결과와 녹화는 먼저 내보내십시오.

## 8. 문제 해결

### `env: node: No such file or directory` 또는 `node를 찾을 수 없음`

Node.js와 CLI가 서로 다른 환경에 설치됐거나 앱이 시작된 시점의 `PATH`가 오래된 경우입니다. `node --version`과 선택한 CLI의 `--version`을 일반 PowerShell에서 확인한 뒤 Windows에 다시 로그인하고 앱을 재실행합니다.

### CLI가 설치됐지만 인증 실패로 표시됨

각 CLI를 PowerShell에서 한 번 직접 실행해 브라우저 로그인이나 약관 확인을 완료합니다. 로그인 후 앱의 `다시 검사`를 누릅니다.

### `whisper-cli 실행 파일을 찾을 수 없습니다`

Releases의 Windows 설치 파일인지 확인합니다. 소스로 실행 중이면 5절의 경로에 `whisper-cli.exe`와 같은 빌드 폴더의 DLL을 함께 복사합니다.

### 마이크 또는 카메라가 보이지 않음

Windows 권한과 물리적 연결을 확인하고 장치를 사용하는 다른 앱을 종료한 뒤 Interview Studio를 재시작합니다. 카메라 실패만 발생한 경우 카메라 없이 음성 면접을 계속할 수 있습니다.

### 질문 생성이 오래 걸림

프로필이나 조사 컨텍스트가 크면 LLM 호출이 길어질 수 있습니다. 면접 준비 단계의 웹 조사와 본 질문 생성에는 짧은 고정 타임아웃을 적용하지 않으며, 화면에 경과 시간과 `준비 취소` 버튼을 표시합니다. 기다리기 어렵다면 취소 버튼으로 현재 CLI 작업을 종료할 수 있습니다. 프로필의 개별 요약 호출은 최대 120초, 전체 컨텍스트 생성은 최대 5분을 허용합니다.

### GitHub Actions 설치 파일 받기

Release가 아직 생성되지 않았으면 저장소의 `Actions` → `Build Windows` → 성공한 실행 → `Artifacts`에서 `interview-studio-windows-x64`를 내려받을 수 있습니다. Artifact는 ZIP으로 제공됩니다.
