

// export class PrismaStore {
//   public prisma: PrismaClient;

//   constructor(private readonly dbUrl?: string) {
//     const _dbUrl = this.dbUrl
//       ? this.dbUrl
//       : config.dbUrl?.startsWith("sqlite")
//       ? `${config.dbUrl}?connection_limit=1&socket_timeout=10`
//       : config.dbUrl;

//     this.prisma = new PrismaClient(_dbUrl ? { datasources: { db: { url: _dbUrl } } } : undefined);
//   }

// }