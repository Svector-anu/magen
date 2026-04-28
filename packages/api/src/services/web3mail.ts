import { IExecWeb3mail, getWeb3Provider } from "@iexec/web3mail";

let _client: IExecWeb3mail | null = null;

function getClient(): IExecWeb3mail {
  if (!_client) {
    const provider = getWeb3Provider(process.env.PRIVATE_KEY!, {
      host: 421614,
      allowExperimentalNetworks: true,
    });
    _client = new IExecWeb3mail(provider);
  }
  return _client;
}

async function findProtectedData(walletAddress: string): Promise<string | null> {
  const contacts = await getClient().fetchMyContacts();
  const match = contacts.find(
    (c) => c.owner.toLowerCase() === walletAddress.toLowerCase()
  );
  return match?.address ?? null;
}

export function sendNotification(
  walletAddress: string,
  subject: string,
  htmlContent: string
): void {
  void (async () => {
    try {
      const protectedData = await findProtectedData(walletAddress);
      if (!protectedData) {
        console.log(`[web3mail] no opt-in for ${walletAddress.slice(0, 10)}…`);
        return;
      }
      await getClient().sendEmail({
        protectedData,
        emailSubject: subject,
        emailContent: htmlContent,
        contentType: "text/html",
        senderName: "Magen",
        useVoucher: true,
      });
      console.log(`[web3mail] notification sent to ${walletAddress.slice(0, 10)}…`);
    } catch (err) {
      console.error("[web3mail] error:", String(err));
    }
  })();
}
