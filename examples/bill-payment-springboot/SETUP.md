# Setup, step by step

Do these in order. Each step has a check — do not move on until the check passes,
because every later step depends on the earlier one.

Total time: about 20 minutes, most of it waiting for downloads.

---

## Step 1 — Install the JDK (do this FIRST)

Install Java **before** the VS Code extensions. The Java extension looks for a
JDK when it first starts; if there isn't one, it sits in an error state and you
have to restart VS Code anyway.

You need **JDK 21**. Not 17, not 8 — this project is compiled at 21.

Pick your operating system:

**Windows** (PowerShell):
```powershell
winget install EclipseAdoptium.Temurin.21.JDK
```

**macOS** (Homebrew):
```bash
brew install --cask temurin@21
```

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install -y openjdk-21-jdk
```

**No package manager, any OS:** download the installer from
[adoptium.net](https://adoptium.net/temurin/releases/?version=21) and run it.

### Check it worked

**Close your terminal, open a new one** (the PATH only updates in new terminals),
then run:

```bash
java -version
```

You must see `21` on the first line:

```
openjdk version "21.0.10" 2026-01-20
```

> **If it says 17, 11 or 8:** you have an older Java ahead of the new one on your
> PATH. That is fine for now — Step 5 shows you how to point VS Code at 21
> directly, which overrides it.
>
> **If it says "command not found":** the installer did not update your PATH.
> Reboot, or add the JDK's `bin` folder to PATH manually.

---

## Step 2 — Install VS Code

Download from [code.visualstudio.com](https://code.visualstudio.com/) and run the
installer.

**On Windows**, tick **"Add to PATH"** during install — that is what makes the
`code` command work in Step 3.

**On macOS**, after installing, open VS Code and run this once:
press `Cmd+Shift+P` → type `Shell Command: Install 'code' command in PATH` → Enter.

### Check it worked

```bash
code --version
```

If that prints a version number, the CLI works and Step 3 can be one command.
If it doesn't, use the clicking method in Step 3 instead — it works either way.

---

## Step 3 — Install the two extensions

You need exactly **two**. They are extension *packs*, so each one pulls in
several extensions in a single install.

### Option A — one command (fastest)

Paste this whole block into a terminal:

```bash
code --install-extension vscjava.vscode-java-pack
code --install-extension vmware.vscode-boot-dev-pack
```

### Option B — clicking

1. Open VS Code.
2. Click the **Extensions** icon in the left bar, or press `Ctrl+Shift+X`
   (`Cmd+Shift+X` on Mac).
3. In the search box, paste **`vscjava.vscode-java-pack`** → click **Install** on
   *Extension Pack for Java*.
4. Clear the box, paste **`vmware.vscode-boot-dev-pack`** → click **Install** on
   *Spring Boot Extension Pack*.

> Search by the **ID**, not the name. There are dozens of similarly named Java
> extensions; the ID matches exactly one and avoids installing the wrong thing.

### What you just installed

`vscjava.vscode-java-pack` — **Extension Pack for Java**, published by `vscjava`:

| Extension | What it gives you |
| --- | --- |
| `redhat.java` | the compiler, red squiggles, autocomplete, go-to-definition |
| `vscjava.vscode-java-debug` | the **Run** and **Debug** links above `main()`, breakpoints |
| `vscjava.vscode-java-test` | the Testing flask icon, running tests individually |
| `vscjava.vscode-maven` | reads `pom.xml`, downloads dependencies |
| `vscjava.vscode-java-dependency` | the Java Projects view in the Explorer |
| `vscjava.vscode-gradle` | Gradle support (unused here — this project is Maven) |

`vmware.vscode-boot-dev-pack` — **Spring Boot Extension Pack**, published by `vmware`:

| Extension | What it gives you |
| --- | --- |
| `vmware.vscode-spring-boot` | autocomplete inside `application.yml`, Spring-aware navigation |
| `vscjava.vscode-spring-boot-dashboard` | the dashboard with the ▶ button to start the app |
| `vscjava.vscode-spring-initializr` | generating *new* Spring projects (not needed here) |

That's 9 extensions from 2 installs. You do **not** need to install them
individually.

### Check it worked

```bash
code --list-extensions | grep -E "java-pack|boot-dev-pack|redhat.java|spring-boot-dashboard"
```

Expect at least these four lines:

```
redhat.java
vmware.vscode-boot-dev-pack
vscjava.vscode-java-pack
vscjava.vscode-spring-boot-dashboard
```

**Now fully quit and reopen VS Code.** The extensions do not activate properly
until you do.

---

## Step 4 — Open the project folder

```bash
git clone https://github.com/dhruvaakashreddy-hue/MobileApp.git
cd MobileApp
git checkout claude/eloquent-einstein-258z4o
code examples/bill-payment-springboot
```

Or in VS Code: **File → Open Folder…** → navigate to
`MobileApp/examples/bill-payment-springboot` → **Select Folder**.

> **This is the step people get wrong.** Open the
> `bill-payment-springboot` folder itself — not `MobileApp`, not `examples`.
> VS Code activates Java support only when it finds `pom.xml` in the folder you
> opened. Open the parent and nothing works, with no error to tell you why.
>
> You are in the right place if you can see `pom.xml` at the top level of the
> Explorer panel.

### Wait for the import — this part is slow

The bottom-right corner will show **"Importing Java projects…"** with a spinner.
The first time, this downloads Spring Boot and its dependencies: **3–10 minutes**
depending on your connection. It only happens once.

### Check it worked

In the Explorer panel (left side), find the **JAVA PROJECTS** section at the
bottom. It should list **bill-payment-springboot**. Expand it and you should see
the `com.billmate.payments` packages.

> **Red squiggles everywhere?** The import is still running, or it failed
> halfway. Press `Ctrl+Shift+P` → `Java: Clean Java Language Server Workspace` →
> **Restart and delete**. Then wait again.

---

## Step 5 — Point VS Code at JDK 21 (only if Step 1 showed the wrong version)

Skip this if `java -version` already said 21.

Press `Ctrl+Shift+P` → `Java: Configure Java Runtime`. A tab opens listing the
JDKs it found. Make sure **JavaSE-21** has a real JDK next to it. If the dropdown
is empty, click **Download** and it will fetch one for you.

---

## Step 6 — Run the app

Three ways. Any one of them works — use whichever you find first.

**Way 1 — the Run link (easiest)**

1. In the Explorer, open
   `src/main/java/com/billmate/payments/BillPaymentApplication.java`
2. Directly above the line `public static void main(String[] args)` you will see
   small grey text: **Run | Debug**
3. Click **Run**

**Way 2 — the Spring Boot Dashboard**

1. Click the Spring icon in the left bar (or Explorer → **SPRING BOOT DASHBOARD**)
2. Hover over `bill-payment-springboot`
3. Click ▶

**Way 3 — the terminal**

Press ``Ctrl+` `` (Ctrl + backtick) to open a terminal inside VS Code:

```bash
./mvnw spring-boot:run      # macOS / Linux
```
```powershell
.\mvnw.cmd spring-boot:run  # Windows
```

> You do **not** need Maven installed. `mvnw` is the Maven wrapper, committed to
> this repo — it downloads the correct Maven version itself on first run.

### Check it worked

The terminal shows:

```
****************************************************************
No Razorpay keys found, so payments are SIMULATED.
****************************************************************

Tomcat started on port 8080 (http) with context path '/'
Started BillPaymentApplication in 1.5 seconds
```

That simulated-mode warning is **expected and correct** — it means the app runs
without a Razorpay account.

---

## Step 7 — Use it

Open **http://localhost:8080** in your browser.

1. You see three bills. Click **Pay now** on *Electricity bill*.
2. The sheet opens with **UPI**, **Card** and **Wallet**. Click one.
3. The payment page shows ₹1,840. Click **Pay ₹1,840**.
4. The green **Payment successful** screen, with a payment ID and
   "Signature verified by the server".

Then go back and press **Simulate a failure** instead — the server rejects the
bad signature and the success screen never appears. That is the security check
working.

---

## Step 8 — Run the tests

```bash
./mvnw test
```

Expect:

```
Tests run: 27, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

Or click the **flask icon** in the left bar to run them one at a time and see
which is which.

### To stop the app

Click the red ■ in the terminal panel, or press `Ctrl+C` in the terminal.

---

## Common problems

| What you see | What to do |
| --- | --- |
| No **Run \| Debug** link above `main` | Wrong folder opened (Step 4), or the import hasn't finished. Check the JAVA PROJECTS panel. |
| `Port 8080 was already in use` | The app is already running in another terminal, or something else has the port. Stop it, or change `server.port` in `src/main/resources/application.yml`. |
| `release version 21 not supported` | VS Code is using an older JDK. Do Step 5. |
| Red squiggles on a clean clone | `Ctrl+Shift+P` → `Java: Clean Java Language Server Workspace`. |
| `mvnw: Permission denied` (Mac/Linux) | `chmod +x mvnw` |
| `'code' is not recognized` | The CLI isn't on PATH. Use Option B in Step 3 (clicking). |
| Extensions installed but nothing happens | Fully quit VS Code and reopen. Not just close the window — quit the application. |

Once all of this works, `README.md` explains what the code does and how to
switch to real Razorpay test keys.
