-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "maxUnits" INTEGER NOT NULL,
    "description" TEXT,
    "productIds" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "referralEnabled" BOOLEAN NOT NULL DEFAULT true,
    "finalRevenue" DECIMAL(65,30),
    "finalOrderCount" INTEGER,
    "finalConversionRate" DOUBLE PRECISION,
    "finalAvgCartSize" DOUBLE PRECISION,
    "finalWaitlistTotal" INTEGER,
    "finalBuyersCount" INTEGER,
    "finalInterestRate" DOUBLE PRECISION,
    "finalDealRate" DOUBLE PRECISION,
    "selloutTimeSeconds" INTEGER,
    "baseCurrency" TEXT DEFAULT 'EUR',
    "soldOut" BOOLEAN DEFAULT false,

    CONSTRAINT "Drop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropOrder" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT,
    "customerEmail" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "firstProductName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromWaitlist" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DropOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropProductStats" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "productName" TEXT NOT NULL,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "selloutTimeSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DropProductStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropTrafficSource" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropTrafficSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropEvent" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "DropEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropHistory" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "totalRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "avgCartSize" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "waitlistTotal" INTEGER NOT NULL DEFAULT 0,
    "buyersFromWaitlist" INTEGER NOT NULL DEFAULT 0,
    "selloutTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DropHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "customerName" TEXT,
    "referralCode" TEXT NOT NULL,
    "referredById" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPosition" INTEGER,
    "lastPositionUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAutomation" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "dropId" TEXT,
    "dropExternalId" TEXT,
    "type" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "mainColor" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Drop_externalId_key" ON "Drop"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DropOrder_dropId_shopifyOrderId_key" ON "DropOrder"("dropId", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "DropProductStats_shopDomain_dropId_idx" ON "DropProductStats"("shopDomain", "dropId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_referralCode_key" ON "WaitlistEntry"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_dropId_email_key" ON "WaitlistEntry"("dropId", "email");

-- CreateIndex
CREATE INDEX "EmailAutomation_shopDomain_type_idx" ON "EmailAutomation"("shopDomain", "type");

-- AddForeignKey
ALTER TABLE "DropOrder" ADD CONSTRAINT "DropOrder_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropProductStats" ADD CONSTRAINT "DropProductStats_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropTrafficSource" ADD CONSTRAINT "DropTrafficSource_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropEvent" ADD CONSTRAINT "DropEvent_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropHistory" ADD CONSTRAINT "DropHistory_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "WaitlistEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
