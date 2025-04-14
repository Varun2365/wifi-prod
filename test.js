var myDate = new Date("2024-06-30")
function getNextDay(date) {
    const nextDate = new Date(date); // Create a copy to avoid modifying the original date
    nextDate.setDate(date.getDate() + 1); // Increment the day
    return nextDate;
  }
  console.log(getNextDay(myDate))