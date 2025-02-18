"use server";

import { prisma } from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

const syncUser = async () => {
  try {
    const {userId} = await auth();
    const user = await currentUser();
    if(!userId || !user) return;

    //check if user exist
    const existingUser = await prisma.user.findUnique({
        where:{
            clerkId:userId
        }
    })
    if(existingUser) return existingUser;

    const dbUser = await prisma.user.create({
        data:{
            clerkId: userId,
            name: `${user.firstName || ""} ${user.lastName || ""}`,
            username: user.username ?? user.emailAddresses[0].emailAddress.split("@")[0],
            email: user.emailAddresses[0].emailAddress,
            image: user.imageUrl,
        }
    })
    return dbUser;
  } catch (error) {
    console.log("error in syncUser", error);
  }
};

const getUserByClerkId  = async (clerkId:string) =>{
  try {
    return await prisma.user.findUnique({
      where:{
        clerkId
      },
      include:{
        _count:{
          select:{
            followers:true,
            following:true,
            posts:true,
          }
        }
      }
    })
  } catch (error) {
    console.log("error occur when geting user by clerkId", error)
  }
}

const getDbUserId  = async () =>{
  try {
    const {userId:clerkId}  = await auth();
    if(!clerkId) return null;

    const user =  await getUserByClerkId(clerkId);
    if(!user) throw new Error("User not found");

    return user.id;
  } catch (error) {
    
  }
}

const getRandomUsers = async () =>{
  try {
    const userId = await getDbUserId();

    if(!userId) return [];

    //get 3 random users exclude overselves and users that we alerady followed
    const randomUsers = await prisma.user.findMany({
      where:{
        AND:[
          {
            NOT:{
              id:userId
            }
          },
          {
          NOT:{
            followers:{
              some:{
                followerId: userId
              }
            }
          }
        }],
      },
      select:{
        id: true,
        name: true,
        username: true,
        image: true,
        _count:{
          select:{
            followers:true
          }
        }
      },
      take: 3,
    })
    return randomUsers;
  } catch (error) {
    console.error("error fetching  random users,", JSON.stringify(error))
  }
}

const toggleFollow = async (targetUserId:string) =>{
try {
  const userId = await getDbUserId();

  if(!userId) return;

  if(userId === targetUserId) throw new Error("You cannnot follow yourself");

  const existingFollow = await prisma.follows.findUnique({
    where:{
      followerId_followingId:{
        followerId: userId,
        followingId: targetUserId
      },
    }
  })

  if(existingFollow){
    //unfollow
    await prisma.follows.delete({
      where:{
        followerId_followingId:{
          followerId:userId!,
          followingId: targetUserId,
        }
      }
    })
  }else{
    //follow
    await prisma.$transaction([
      prisma.follows.create({
        data:{
          followerId: userId!,
          followingId: targetUserId,
        }
      }),

      prisma.notification.create({
        data:{
          type:"FOLLOW",
          userId: targetUserId,  //user being followed
          creatorId: userId!, // user following or who made the notification
        }
      })
    ])
  }

  revalidatePath('/')
  return {success:true}

} catch (error) {
  console.error("error in togglefollow", JSON.stringify(error))
  return {success: false, error:"Error toggling follow"}
}
}

export { syncUser,
  getUserByClerkId,
  getDbUserId,
  getRandomUsers,
  toggleFollow,
 };
