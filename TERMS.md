# wFileManager Terms of Use

Last updated: 2026-07-25

These terms govern use of wFileManager, including Community installations and Pro managed application-data services provided by KmerHosting LLC.

## 1. Editions

wFileManager has two editions:

- Community: free software that stores wFileManager application records locally in SQLite on the user's server.
- Pro: paid managed application data for wFileManager records, priced at $50 USD per instance per year with 100 MB included and $1 USD per additional 100 MB per year.

Both editions expose the same file-manager features. The difference is where wFileManager stores its own application records and who is responsible for backup and recovery of those records.

## 2. Pro licence keys and payment

A new Pro installation requires a valid paid licence key before the first administrator account can be created. A licence key may be limited to a specific instance, customer, order, period or storage quota.

After checkout, the customer returns to the wFileManager customer dashboard and clicks **Check status**. If CamerPay confirms payment, the dashboard issues the licence key, displays it to the customer and sends the licence key email once.

A Pro licence key authorizes only the managed wFileManager application-data service. It does not grant server infrastructure, domain registration, filesystem backup, website hosting, database hosting or other services unless those are purchased separately.

## 3. Unpaid Pro lifecycle

When a Pro subscription becomes unpaid, the following lifecycle applies:

- the service enters a grace period after the paid-through date passes;
- more than 7 days unpaid may suspend the Pro managed application-data account and revoke sessions;
- more than 30 days unpaid may permanently delete the Pro managed application data and remote instance account.

Deletion covers only wFileManager application records stored by the Pro backend. Server filesystem files, websites, databases, uploads, directories, mounted volumes and operating-system configuration are not part of Pro managed application data.

## 4. Uninstalling

Community uninstall removes the local application, local SQLite records and configuration from the server.

Pro uninstall has two separate choices:

- local-only removal, which removes the server installation but keeps the paid Pro managed application data and subscription for later recovery;
- permanent Pro deletion, which deletes the remote managed application data and instance account, then removes the local installation.

Permanent Pro deletion requires the saved Recovery Kit. If the Recovery Kit does not match the remote account, remote deletion is rejected.

## 5. Operator responsibility

The server administrator remains responsible for:

- choosing correct paths and commands;
- maintaining server filesystem backups;
- backing up websites, databases and uploads;
- protecting root access and Recovery Kit files;
- complying with laws, hosting-provider rules and third-party software licences.

wFileManager can operate with elevated privileges. Incorrect operations can cause permanent data loss, service interruption or server compromise.

## 6. Support

Official support contact: support@kmerhosting.com.

Security issues should be reported to the same support address with enough detail to reproduce the issue. Do not publicly disclose exploitable vulnerabilities before reasonable coordination.
